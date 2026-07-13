(function () {
  "use strict";

  var labels = {
    en: {
      score: "CAI Score",
      demo: "Book a demo",
      language: "Language"
    },
    cs: {
      score: "CAI Score",
      demo: "Rezervovat ukázku",
      language: "Jazyk"
    },
    de: {
      score: "CAI Score",
      demo: "Demo buchen",
      language: "Sprache"
    },
    fr: {
      score: "CAI Score",
      demo: "Réserver une démo",
      language: "Langue"
    },
    es: {
      score: "CAI Score",
      demo: "Reservar una demo",
      language: "Idioma"
    },
    it: {
      score: "CAI Score",
      demo: "Prenota una demo",
      language: "Lingua"
    },
    pl: {
      score: "CAI Score",
      demo: "Umów prezentację",
      language: "Język"
    },
    pt: {
      score: "CAI Score",
      demo: "Agendar demonstração",
      language: "Idioma"
    }
  };

  function locale() {
    var value = (window.location.pathname.split("/")[1] || "").toLowerCase();

    if (Object.prototype.hasOwnProperty.call(labels, value)) {
      return value;
    }

    return "en";
  }

  function localPath(path) {
    var current = locale();

    if (current === "en") {
      return path;
    }

    return "/" + current + path;
  }

  function fixSelect(select) {
    if (!select) {
      return;
    }

    select.style.setProperty("color", "#1d1b1a", "important");
    select.style.setProperty("background-color", "#ffffff", "important");
    select.style.setProperty(
      "-webkit-text-fill-color",
      "#1d1b1a",
      "important"
    );

    Array.prototype.forEach.call(select.options || [], function (option) {
      option.style.color = "#1d1b1a";
      option.style.backgroundColor = "#ffffff";
    });
  }

  function fixLanguageDropdowns() {
    var selector = [
      "select.lang",
      "select#langsel",
      "select#homelang",
      'select[id*="lang" i]',
      'select[name*="lang" i]',
      'select[aria-label*="language" i]'
    ].join(",");

    Array.prototype.forEach.call(
      document.querySelectorAll(selector),
      fixSelect
    );
  }

  function improveMobileMenu() {
    var header = document.querySelector("header");

    if (!header) {
      return;
    }

    var burger = header.querySelector(
      ".burger, .menu-toggle, [aria-label='Menu'], [aria-label*='menu' i]"
    );

    var menu =
      header.querySelector(".mnav, .mobile-nav, [data-mobile-nav]") ||
      document.querySelector(".mnav, .mobile-nav, [data-mobile-nav]");

    if (!burger || !menu) {
      return;
    }

    var currentLocale = locale();
    var currentLabels = labels[currentLocale] || labels.en;

    if (!menu.id) {
      menu.id = "cai-mobile-navigation";
    }

    burger.setAttribute("aria-controls", menu.id);

    if (!burger.hasAttribute("aria-expanded")) {
      burger.setAttribute("aria-expanded", "false");
    }

    var menuLinks = Array.prototype.slice.call(menu.querySelectorAll("a"));

    var hasScore = menuLinks.some(function (link) {
      var href = link.getAttribute("href") || "";
      var text = (link.textContent || "").toLowerCase();

      return (
        href.toLowerCase().indexOf("score") !== -1 ||
        text.indexOf("cai score") !== -1
      );
    });

    if (!hasScore) {
      var scoreLink = document.createElement("a");
      scoreLink.href = localPath("/agents#score");
      scoreLink.textContent = currentLabels.score;

      if (menu.firstChild) {
        menu.insertBefore(scoreLink, menu.firstChild);
      } else {
        menu.appendChild(scoreLink);
      }
    }

    var hasDemo = Array.prototype.some.call(
      menu.querySelectorAll("a"),
      function (link) {
        var href = link.getAttribute("href") || "";
        return href.toLowerCase().indexOf("demo") !== -1;
      }
    );

    if (!hasDemo) {
      var demoLink = document.createElement("a");
      demoLink.href = localPath("/demo");
      demoLink.textContent = currentLabels.demo;
      demoLink.className = "cai-mobile-demo";
      menu.appendChild(demoLink);
    }

    var desktopLanguage = header.querySelector(
      [
        "select.lang",
        "select#langsel",
        "select#homelang",
        "select[id*='lang' i]",
        "select[name*='lang' i]",
        "select[aria-label*='language' i]"
      ].join(",")
    );

    if (
      desktopLanguage &&
      !menu.querySelector(".cai-mobile-language")
    ) {
      var languageContainer = document.createElement("div");
      languageContainer.className = "cai-mobile-language";

      var languageLabel = document.createElement("label");
      languageLabel.textContent = currentLabels.language;

      var mobileLanguage = desktopLanguage.cloneNode(true);
      mobileLanguage.removeAttribute("id");
      mobileLanguage.setAttribute(
        "aria-label",
        currentLabels.language
      );

      fixSelect(mobileLanguage);

      mobileLanguage.addEventListener("change", function () {
        if (mobileLanguage.value) {
          window.location.href = mobileLanguage.value;
        }
      });

      languageContainer.appendChild(languageLabel);
      languageContainer.appendChild(mobileLanguage);
      menu.appendChild(languageContainer);
    }

    if (!burger.hasAttribute("data-cai-mobile-bound")) {
      burger.setAttribute("data-cai-mobile-bound", "true");

      burger.addEventListener("click", function () {
        window.setTimeout(function () {
          var isOpen =
            menu.classList.contains("open") ||
            menu.getAttribute("data-open") === "true";

          burger.setAttribute(
            "aria-expanded",
            isOpen ? "true" : "false"
          );
        }, 0);
      });
    }

    menu.addEventListener("click", function (event) {
      var link = event.target.closest
        ? event.target.closest("a")
        : null;

      if (link) {
        burger.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") {
        return;
      }

      menu.classList.remove("open");
      menu.setAttribute("data-open", "false");
      burger.setAttribute("aria-expanded", "false");
    });
  }

  function wrapTables() {
    Array.prototype.forEach.call(
      document.querySelectorAll("table"),
      function (table) {
        if (
          table.parentElement &&
          table.parentElement.classList.contains("cai-table-scroll")
        ) {
          return;
        }

        var wrapper = document.createElement("div");
        wrapper.className = "cai-table-scroll";

        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      }
    );
  }

  function identifyOverflowingNavigation() {
    Array.prototype.forEach.call(
      document.querySelectorAll("nav"),
      function (nav) {
        if (
          nav.closest("header") ||
          nav.classList.contains("mnav") ||
          nav.classList.contains("mobile-nav")
        ) {
          return;
        }

        if (nav.scrollWidth > nav.clientWidth + 2) {
          nav.classList.add("cai-scroll-navigation");
        }
      }
    );
  }

  function start() {
    fixLanguageDropdowns();
    improveMobileMenu();
    wrapTables();
    identifyOverflowingNavigation();

    window.addEventListener(
      "resize",
      identifyOverflowingNavigation,
      { passive: true }
    );

    window.addEventListener(
      "pageshow",
      fixLanguageDropdowns
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
}());