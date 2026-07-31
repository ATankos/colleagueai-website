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
          var targetUrl;

          try {
            targetUrl = new URL(mobileLanguage.value, window.location.href);
          } catch (e) {
            return;
          }

          if (
            targetUrl.protocol === "http:" ||
            targetUrl.protocol === "https:"
          ) {
            window.location.href = targetUrl.href;
          }
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

/* === ColleagueAI - unified mobile navigation (added 2026-07) ============
   Runs on every page & language via this shared script. Guarantees the
   hamburger menu always contains the site sections, so users can reach any
   section from anywhere. Locale-correct links; skips items already present. */
(function () {
  var MENU = {
    en: { items: [["/agents","Catalogue"],["/agents#score","CAI Score"],["/pricing","Pricing"],["/trust","Trust"],["/partners","Partners"],["/contact","Contact"]], demo: ["/demo","Book a demo"] },
    cs: { items: [["/cs/agenti","Katalog"],["/cs/agenti#score","CAI Score"],["/cs/cenik","Cen\u00EDk"],["/cs/duvera","Trust"],["/cs/partneri","Partners"],["/cs/kontakt","Kontakt"]], demo: ["/demo","Domluvit sch\u016Fzku"] },
    de: { items: [["/de/agenten","Katalog"],["/de/agenten#score","CAI Score"],["/de/preise","Preise"],["/de/vertrauen","Trust"],["/de/partner","Partners"],["/de/kontakt","Kontakt"]], demo: ["/demo","Termin vereinbaren"] },
    es: { items: [["/es/agentes","Cat\u00E1logo"],["/es/agentes#score","CAI Score"],["/es/precios","Precios"],["/es/confianza","Trust"],["/es/socios","Partners"],["/es/contacto","Contacto"]], demo: ["/demo","Reservar una demo"] },
    fr: { items: [["/fr/agents","Catalogue"],["/fr/agents#score","CAI Score"],["/fr/tarifs","Tarifs"],["/fr/confiance","Confiance"],["/fr/partenaires","Partenaires"],["/fr/contact","Contact"]], demo: ["/demo","R\u00E9server une d\u00E9mo"] },
    it: { items: [["/it/agenti","Catalogo"],["/it/agenti#score","CAI Score"],["/it/prezzi","Prezzi"],["/it/fiducia","Trust"],["/it/partner","Partners"],["/it/contatti","Contatti"]], demo: ["/demo","Prenota una demo"] },
    pl: { items: [["/pl/agenci","Katalog"],["/pl/agenci#score","CAI Score"],["/pl/cennik","Cennik"],["/pl/zaufanie","Trust"],["/pl/partnerzy","Partners"],["/pl/kontakt","Kontakt"]], demo: ["/demo","Um\u00F3w demo"] },
    pt: { items: [["/pt/agentes","Cat\u00E1logo"],["/pt/agentes#score","CAI Score"],["/pt/precos","Pre\u00E7os"],["/pt/confianca","Trust"],["/pt/parceiros","Partners"],["/pt/contacto","Contacto"]], demo: ["/demo","Marcar uma demo"] }
  };
  function locale(){var m=location.pathname.match(/^\/(cs|de|es|fr|it|pl|pt)(\/|$)/);return m?m[1]:"en";}
  function norm(h){return (h||"").replace(location.origin,"").replace(/\/$/,"").toLowerCase();}
  function run(){
    var cfg=MENU[locale()]||MENU.en;
    var menu=document.querySelector(".mnav, .cai-hdr-mnav, .cainav-drawer, .mobile-nav, [data-mobile-nav]");
    if(!menu)return;
    var have={};[].forEach.call(menu.querySelectorAll("a"),function(a){have[norm(a.getAttribute("href"))]=true;});
    var tmpl=menu.querySelector("a");
    var added=[];
    cfg.items.concat([cfg.demo]).forEach(function(p){
      if(have[norm(p[0])])return;
      var a=tmpl?tmpl.cloneNode(false):document.createElement("a");
      a.removeAttribute("id");
      a.className=((a.className||"")+" cai-unav-link").trim();
      a.setAttribute("href",p[0]);
      a.textContent=p[1];
      added.push(a);
    });
    added.slice().reverse().forEach(function(a){menu.insertBefore(a,menu.firstChild);});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run);else run();
})();


/* === ColleagueAI - remove duplicate stacked header (added 2026-07) ======
   Some pages render two <header> bars. Keep the one with the real nav menu;
   hide the rest, so every page has one clean header like the home page. */
(function(){
  function dedupeHeaders(){
    var hs=[].slice.call(document.querySelectorAll('header'));
    if(hs.length<2)return;
    var keep=hs.filter(function(h){return h.querySelector('.cai-hdr-mnav, .mnav, .cainav-drawer');})[0]
          || hs.filter(function(h){return h.querySelector('.cai-hdr-burger, .burger, .cainav-burger');})[0];
    if(!keep)return;
    hs.forEach(function(h){ if(h!==keep){ h.style.display='none'; h.setAttribute('data-cai-dupe-header','1'); } });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',dedupeHeaders);
  else dedupeHeaders();
})();


/* === Agents page: make the hamburger open its menu (added 2026-07) ========
   The Agents drawer already contains all the links, but its burger had no
   working handler and the drawer had no open-style, so it never appeared. */
(function(){
  function fix(){
    var b=document.querySelector('.cainav-burger');
    var m=document.getElementById('cainavDrawer')||document.querySelector('.cainav-drawer');
    if(!b||!m||b.getAttribute('data-cai-toggle'))return;
    b.setAttribute('data-cai-toggle','1');
    b.addEventListener('click',function(){m.classList.toggle('cai-open');});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fix);else fix();
})();


/* === ColleagueAI - unified header on non-landing pages (leaves home alone) === */
(function () {
  var MENU = {
    en: { home:"/",   items:[["/agents","Catalogue"],["/agents#score","CAI Score"],["/pricing","Pricing"],["/trust","Trust"],["/partners","Partners"],["/contact","Contact"]], demo:["/demo","Book a demo"] },
    cs: { home:"/cs", items:[["/cs/agenti","Katalog"],["/cs/agenti#score","CAI Score"],["/cs/cenik","Cen\u00EDk"],["/cs/duvera","Trust"],["/cs/partneri","Partners"],["/cs/kontakt","Kontakt"]], demo:["/demo","Domluvit sch\u016Fzku"] },
    de: { home:"/de", items:[["/de/agenten","Katalog"],["/de/agenten#score","CAI Score"],["/de/preise","Preise"],["/de/vertrauen","Trust"],["/de/partner","Partners"],["/de/kontakt","Kontakt"]], demo:["/demo","Termin vereinbaren"] },
    es: { home:"/es", items:[["/es/agentes","Cat\u00E1logo"],["/es/agentes#score","CAI Score"],["/es/precios","Precios"],["/es/confianza","Trust"],["/es/socios","Partners"],["/es/contacto","Contacto"]], demo:["/demo","Reservar una demo"] },
    fr: { home:"/fr", items:[["/fr/agents","Catalogue"],["/fr/agents#score","CAI Score"],["/fr/tarifs","Tarifs"],["/fr/confiance","Confiance"],["/fr/partenaires","Partenaires"],["/fr/contact","Contact"]], demo:["/demo","R\u00E9server une d\u00E9mo"] },
    it: { home:"/it", items:[["/it/agenti","Catalogo"],["/it/agenti#score","CAI Score"],["/it/prezzi","Prezzi"],["/it/fiducia","Trust"],["/it/partner","Partners"],["/it/contatti","Contatti"]], demo:["/demo","Prenota una demo"] },
    pl: { home:"/pl", items:[["/pl/agenci","Katalog"],["/pl/agenci#score","CAI Score"],["/pl/cennik","Cennik"],["/pl/zaufanie","Trust"],["/pl/partnerzy","Partners"],["/pl/kontakt","Kontakt"]], demo:["/demo","Um\u00F3w demo"] },
    pt: { home:"/pt", items:[["/pt/agentes","Cat\u00E1logo"],["/pt/agentes#score","CAI Score"],["/pt/precos","Pre\u00E7os"],["/pt/confianca","Trust"],["/pt/parceiros","Partners"],["/pt/contacto","Contacto"]], demo:["/demo","Marcar uma demo"] }
  };
  var LANGS = [["/","English"],["/cs","\u010Ce\u0161tina"],["/de","Deutsch"],["/fr","Fran\u00E7ais"],["/es","Espa\u00F1ol"],["/it","Italiano"],["/pl","Polski"],["/pt","Portugu\u00EAs"]];
  function locale(){ var m=location.pathname.match(/^\/(cs|de|es|fr|it|pl|pt)(\/|$)/); return m?m[1]:"en"; }
  function build(){
    if(document.querySelector(".cai-uni-header"))return;
    var p=location.pathname.replace(/\/$/,"");
    if(p===""||/^\/(cs|de|es|fr|it|pl|pt)$/.test(p)||/\/home$/.test(p))return;
    var loc=locale(), cfg=MENU[loc]||MENU.en;
    var links=cfg.items.map(function(x){return '<a href="'+x[0]+'">'+x[1]+"</a>";}).join("");
    var demo='<a class="cai-uni-demo" href="'+cfg.demo[0]+'">'+cfg.demo[1]+"</a>";
    var opts=LANGS.map(function(l){var s=((l[0]==="/"&&loc==="en")||l[0]==="/"+loc)?" selected":"";return '<option value="'+l[0]+'"'+s+">"+l[1]+"</option>";}).join("");
    var lang='<select class="cai-uni-lang" aria-label="Language">'+opts+"</select>";
    var h=document.createElement("header"); h.className="cai-uni-header";
    h.innerHTML='<div class="cai-uni-bar"><a class="cai-uni-logo" href="'+cfg.home+'">Colleague<b>AI</b></a><nav class="cai-uni-links">'+links+lang+demo+'</nav><button class="cai-uni-burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button></div><nav class="cai-uni-mnav">'+links+demo+'<div class="cai-uni-mlang">'+lang+"</div></nav>";
    [].forEach.call(document.querySelectorAll("header"),function(el){el.style.display="none";el.setAttribute("data-cai-old-header","1");});
    document.body.insertBefore(h,document.body.firstChild);
    var b=h.querySelector(".cai-uni-burger"), m=h.querySelector(".cai-uni-mnav");
    b.addEventListener("click",function(){var o=m.classList.toggle("open");b.setAttribute("aria-expanded",o?"true":"false");});
    m.addEventListener("click",function(e){if(e.target.tagName==="A")m.classList.remove("open");});
    [].forEach.call(h.querySelectorAll(".cai-uni-lang"),function(sel){sel.addEventListener("change",function(){if(this.value)location.href=this.value;});});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",build); else build();
})();


/* === ColleagueAI - keep "Book a demo" in the current language (added 2026-07)
   The demo route is localised (/cs/demo, /de/demo ... are all valid per
   vercel.json), but most links point at the English "/demo", so a Czech visitor
   who clicks "Domluvit schuzku" lands on the English demo. Rewrite every /demo
   link to the current locale, re-running after the shared header is injected. */
(function () {
  function loc(){ var m = location.pathname.match(/^\/(cs|de|es|fr|it|pl|pt)(\/|$)/); return m ? m[1] : "en"; }
  function fixDemoLinks(){
    var l = loc();
    if (l === "en") return;
    var links = document.querySelectorAll('a[href="/demo"], a[href^="/demo#"], a[href^="/demo?"]');
    Array.prototype.forEach.call(links, function (a) {
      a.setAttribute("href", "/" + l + a.getAttribute("href"));
    });
  }
  function run(){ fixDemoLinks(); setTimeout(fixDemoLinks, 0); setTimeout(fixDemoLinks, 400); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
})();
