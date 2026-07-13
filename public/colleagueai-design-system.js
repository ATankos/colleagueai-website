(() => {
  "use strict";

  if (document.getElementById("cai-global-header")) {
    return;
  }

  const supportedLanguages = [
    "en",
    "cs",
    "de",
    "fr",
    "es",
    "it",
    "pl",
    "pt"
  ];

  const languageNames = {
    en: "EN",
    cs: "CS",
    de: "DE",
    fr: "FR",
    es: "ES",
    it: "IT",
    pl: "PL",
    pt: "PT"
  };

  const language = (() => {
    const htmlLanguage = String(
      document.documentElement.lang || ""
    ).slice(0, 2).toLowerCase();

    const pathLanguage = location.pathname
      .split("/")
      .filter(Boolean)[0]
      ?.toLowerCase();

    if (supportedLanguages.includes(pathLanguage)) {
      return pathLanguage;
    }

    if (supportedLanguages.includes(htmlLanguage)) {
      return htmlLanguage;
    }

    return "en";
  })();

  const prefix = language === "en" ? "" : `/${language}`;

  const route = (path) => {
    return `${prefix}${path}`.replace(/\/+/g, "/") || "/";
  };

  const labelsByLanguage = {
    en: {
      catalogue: "Catalogue",
      score: "CAI Score",
      trust: "Trust",
      partners: "Partners",
      contact: "Contact",
      demo: "Book a demo",
      menu: "Open navigation",
      language: "Language"
    },

    cs: {
      catalogue: "Katalog",
      score: "CAI Score",
      trust: "Důvěra",
      partners: "Partneři",
      contact: "Kontakt",
      demo: "Domluvit ukázku",
      menu: "Otevřít navigaci",
      language: "Jazyk"
    },

    de: {
      catalogue: "Katalog",
      score: "CAI Score",
      trust: "Vertrauen",
      partners: "Partner",
      contact: "Kontakt",
      demo: "Demo buchen",
      menu: "Navigation öffnen",
      language: "Sprache"
    },

    fr: {
      catalogue: "Catalogue",
      score: "CAI Score",
      trust: "Confiance",
      partners: "Partenaires",
      contact: "Contact",
      demo: "Réserver une démo",
      menu: "Ouvrir la navigation",
      language: "Langue"
    },

    es: {
      catalogue: "Catálogo",
      score: "CAI Score",
      trust: "Confianza",
      partners: "Socios",
      contact: "Contacto",
      demo: "Reservar demo",
      menu: "Abrir navegación",
      language: "Idioma"
    },

    it: {
      catalogue: "Catalogo",
      score: "CAI Score",
      trust: "Fiducia",
      partners: "Partner",
      contact: "Contatti",
      demo: "Prenota demo",
      menu: "Apri navigazione",
      language: "Lingua"
    },

    pl: {
      catalogue: "Katalog",
      score: "CAI Score",
      trust: "Zaufanie",
      partners: "Partnerzy",
      contact: "Kontakt",
      demo: "Umów demo",
      menu: "Otwórz nawigację",
      language: "Język"
    },

    pt: {
      catalogue: "Catálogo",
      score: "CAI Score",
      trust: "Confiança",
      partners: "Parceiros",
      contact: "Contato",
      demo: "Agendar demo",
      menu: "Abrir navegação",
      language: "Idioma"
    }
  };

  const labels =
    labelsByLanguage[language] ||
    labelsByLanguage.en;

  function findLanguageSelect() {
    const candidates = document.querySelectorAll(
      "select.lang," +
      "select#langsel," +
      "select[name*='lang' i]," +
      "select[id*='lang' i]," +
      "select[aria-label*='language' i]," +
      "select[aria-label*='jazyk' i]"
    );

    return Array.from(candidates).find((select) => {
      return select.options && select.options.length >= 2;
    }) || null;
  }

  const oldLanguageSelect = findLanguageSelect();

  function markOldNavigation() {
    const selectors = [
      "body > header",
      "body > nav",
      ".cai-global-header",
      ".global-header",
      ".site-header",
      ".nav-shell",
      ".topbar"
    ];

    const candidates = new Set();

    selectors.forEach((selector) => {
      document
        .querySelectorAll(selector)
        .forEach((element) => candidates.add(element));
    });

    candidates.forEach((element) => {
      if (
        element.id === "cai-global-header" ||
        element.closest("#cai-global-header")
      ) {
        return;
      }

      const linkCount =
        element.querySelectorAll("a").length;

      const containsNavigation =
        Boolean(element.querySelector("nav")) ||
        linkCount >= 3;

      const top =
        element.getBoundingClientRect().top +
        window.scrollY;

      if (containsNavigation && top < 180) {
        element.setAttribute(
          "data-cai-superseded",
          "true"
        );

        element.setAttribute(
          "aria-hidden",
          "true"
        );
      }
    });
  }

  markOldNavigation();

  const navItems = [
    {
      key: "catalogue",
      href: route("/agents")
    },
    {
      key: "score",
      href: `${route("/agents")}#score`
    },
    {
      key: "trust",
      href: route("/trust")
    },
    {
      key: "partners",
      href: route("/partners")
    },
    {
      key: "contact",
      href: `${route("/")}#contact`
    }
  ];

  const header = document.createElement("header");

  header.id = "cai-global-header";

  header.innerHTML = `
    <div class="cai-header-inner">
      <a
        class="cai-brand"
        href="${route("/")}"
        aria-label="Colleague AI home"
      >
        <span
          class="cai-brand-mark"
          aria-hidden="true"
        >
          <span></span>
        </span>

        <span class="cai-brand-name">
          COLLEAGUE AI
        </span>
      </a>

      <nav
        class="cai-desktop-nav"
        aria-label="Primary navigation"
      >
        ${navItems.map((item) => `
          <a
            class="cai-nav-link"
            data-nav-key="${item.key}"
            href="${item.href}"
          >
            ${labels[item.key]}
          </a>
        `).join("")}
      </nav>

      <div class="cai-header-actions">
        <select
          class="cai-language-select"
          aria-label="${labels.language}"
        ></select>

        <a
          class="cai-header-cta"
          href="${route("/")}#contact"
        >
          ${labels.demo}
        </a>

        <button
          class="cai-menu-button"
          type="button"
          aria-expanded="false"
          aria-controls="cai-mobile-drawer"
          aria-label="${labels.menu}"
        >
          <span
            class="cai-menu-icon"
            aria-hidden="true"
          ></span>
        </button>
      </div>
    </div>
  `;

  const drawer = document.createElement("div");

  drawer.id = "cai-mobile-drawer";
  drawer.setAttribute("data-open", "false");

  drawer.innerHTML = `
    <nav
      class="cai-drawer-nav"
      aria-label="Mobile navigation"
    >
      ${navItems.map((item) => `
        <a
          class="cai-drawer-link"
          href="${item.href}"
        >
          ${labels[item.key]}
        </a>
      `).join("")}

      <a
        class="cai-drawer-cta"
        href="${route("/")}#contact"
      >
        ${labels.demo}
      </a>
    </nav>
  `;

  document.body.prepend(drawer);
  document.body.prepend(header);

  const languageSelect =
    header.querySelector(".cai-language-select");

  if (oldLanguageSelect) {
    Array
      .from(oldLanguageSelect.options)
      .forEach((oldOption) => {
        const option =
          document.createElement("option");

        option.value =
          oldOption.value;

        option.textContent =
          oldOption.textContent.trim();

        option.selected =
          oldOption.selected;

        languageSelect.appendChild(option);
      });
  } else {
    supportedLanguages.forEach((code) => {
      const option =
        document.createElement("option");

      option.value = code;
      option.textContent = languageNames[code];
      option.selected = code === language;

      languageSelect.appendChild(option);
    });
  }

  languageSelect.addEventListener(
    "change",
    () => {
      const targetLanguage = String(
        languageSelect.value || ""
      )
        .trim()
        .toLowerCase();

      /*
       * Every navigation destination below is a fixed,
       * same-origin literal. Browser-controlled text is
       * never copied into a URL or reinterpreted as HTML.
       */
      switch (targetLanguage) {
        case "en":
          window.location.assign("/");
          break;

        case "cs":
          window.location.assign("/cs/");
          break;

        case "de":
          window.location.assign("/de/");
          break;

        case "fr":
          window.location.assign("/fr/");
          break;

        case "es":
          window.location.assign("/es/");
          break;

        case "it":
          window.location.assign("/it/");
          break;

        case "pl":
          window.location.assign("/pl/");
          break;

        case "pt":
          window.location.assign("/pt/");
          break;

        default:
          break;
      }
    }
  );
  const menuButton =
    header.querySelector(".cai-menu-button");

  const closeMenu = () => {
    menuButton.setAttribute(
      "aria-expanded",
      "false"
    );

    drawer.setAttribute(
      "data-open",
      "false"
    );

    document.body.classList.remove(
      "cai-menu-open"
    );
  };

  const openMenu = () => {
    menuButton.setAttribute(
      "aria-expanded",
      "true"
    );

    drawer.setAttribute(
      "data-open",
      "true"
    );

    document.body.classList.add(
      "cai-menu-open"
    );

    drawer.querySelector("a")?.focus();
  };

  menuButton.addEventListener(
    "click",
    () => {
      const isOpen =
        menuButton.getAttribute(
          "aria-expanded"
        ) === "true";

      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    }
  );

  drawer.addEventListener(
    "click",
    (event) => {
      if (event.target.closest("a")) {
        closeMenu();
      }
    }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    }
  );

  window.addEventListener(
    "resize",
    () => {
      if (window.innerWidth > 1100) {
        closeMenu();
      }
    }
  );

  const normalizedPath =
    location.pathname.replace(/\/$/, "") ||
    "/";

  header
    .querySelectorAll(".cai-nav-link")
    .forEach((link) => {
      const targetPath =
        new URL(
          link.href,
          location.origin
        ).pathname.replace(/\/$/, "") ||
        "/";

      if (
        targetPath !== "/" &&
        normalizedPath.startsWith(targetPath)
      ) {
        link.setAttribute(
          "aria-current",
          "page"
        );
      }
    });

  document
    .querySelectorAll("table")
    .forEach((table) => {
      if (
        table.parentElement?.classList.contains(
          "cai-table-scroll"
        )
      ) {
        return;
      }

      const wrapper =
        document.createElement("div");

      wrapper.className =
        "cai-table-scroll";

      table.parentNode.insertBefore(
        wrapper,
        table
      );

      wrapper.appendChild(table);
    });

  document.documentElement.classList.add(
    "cai-unified-design"
  );
})();