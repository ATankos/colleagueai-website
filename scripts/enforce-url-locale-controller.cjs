const fs = require("fs");
const path = require("path");

const PAGES = ["agents", "trust", "partners", "privacy", "terms"];
const ROOTS = ["public", "dist"];
const CONTROLLER = "<style id=\"cai-url-locale-controller-css\">\nhtml[data-cai-page=\"agents\"] #cai-language-guide,\nhtml[data-cai-page=\"agents\"] #cai-global-language-switcher,\nhtml[data-cai-page=\"agents\"] #cai-site-journey,\nhtml[data-cai-page=\"agents\"] #cai-buyer-path {\n  display: none !important;\n}\n</style>\n<script id=\"cai-url-locale-controller\">\n(function () {\n  var LOCALES = [\"en\", \"cs\", \"de\", \"fr\", \"es\", \"it\", \"pl\", \"pt\"];\n  var PAGES = [\"agents\", \"trust\", \"partners\", \"privacy\", \"terms\"];\n  var LOCALE_LABELS = {\n    en: \"English\",\n    cs: \"\u010ce\u0161tina\",\n    de: \"Deutsch\",\n    fr: \"Fran\u00e7ais\",\n    es: \"Espa\u00f1ol\",\n    it: \"Italiano\",\n    pl: \"Polski\",\n    pt: \"Portugu\u00eas\"\n  };\n\n  function routeParts() {\n    return location.pathname.split(\"/\").filter(Boolean);\n  }\n\n  function routeLocale() {\n    var parts = routeParts();\n    return LOCALES.indexOf(parts[0]) >= 0 ? parts[0] : \"en\";\n  }\n\n  function routePage() {\n    var parts = routeParts();\n    if (LOCALES.indexOf(parts[0]) >= 0) parts.shift();\n    var page = (parts[0] || \"agents\").toLowerCase();\n    return PAGES.indexOf(page) >= 0 ? page : \"agents\";\n  }\n\n  function normalizeLocale(value) {\n    value = String(value || \"\").trim().toLowerCase();\n    if (value === \"cz\" || value === \"czech\" || value === \"\u010de\u0161tina\") return \"cs\";\n    if (value === \"english\") return \"en\";\n    if (value === \"deutsch\" || value === \"german\") return \"de\";\n    if (value === \"fran\u00e7ais\" || value === \"french\") return \"fr\";\n    if (value === \"espa\u00f1ol\" || value === \"spanish\") return \"es\";\n    if (value === \"italiano\" || value === \"italian\") return \"it\";\n    if (value === \"polski\" || value === \"polish\") return \"pl\";\n    if (value === \"portugu\u00eas\" || value === \"portuguese\") return \"pt\";\n    return LOCALES.indexOf(value) >= 0 ? value : \"\";\n  }\n\n  function routeFor(locale) {\n    return \"/\" + locale + \"/\" + routePage() + location.search + location.hash;\n  }\n\n  function localeFromHref(href) {\n    if (!href) return \"\";\n    try {\n      var url = new URL(href, location.origin);\n      var parts = url.pathname.split(\"/\").filter(Boolean);\n      return LOCALES.indexOf(parts[0]) >= 0 ? parts[0] : \"\";\n    } catch (error) {\n      var fallbackParts = String(href).split(\"/\").filter(Boolean);\n      return LOCALES.indexOf(fallbackParts[0]) >= 0 ? fallbackParts[0] : \"\";\n    }\n  }\n\n  function storeLocale(locale) {\n    try {\n      [\n        \"lang\",\n        \"language\",\n        \"locale\",\n        \"caiLang\",\n        \"cai_lang\",\n        \"caiLocale\",\n        \"cai_locale\",\n        \"colleagueaiLang\",\n        \"colleagueai_lang\",\n        \"colleagueaiLocale\",\n        \"colleagueai_locale\"\n      ].forEach(function (key) {\n        localStorage.setItem(key, locale);\n      });\n    } catch (error) {}\n  }\n\n  var currentLocale = routeLocale();\n  var currentPage = routePage();\n\n  document.documentElement.lang = currentLocale;\n  document.documentElement.setAttribute(\"data-cai-route-locale\", currentLocale);\n  document.documentElement.setAttribute(\"data-cai-page\", currentPage);\n  window.__CAI_ROUTE_LOCALE = currentLocale;\n  window.__cai_route_locale = currentLocale;\n  window.__cai_locale = currentLocale;\n  window.caiLocaleUrlFor = routeFor;\n  storeLocale(currentLocale);\n\n  function isLanguageSelect(select) {\n    if (!select || select.tagName !== \"SELECT\") return false;\n    var text = [\n      select.id || \"\",\n      select.name || \"\",\n      select.className || \"\",\n      select.getAttribute(\"aria-label\") || \"\"\n    ].join(\" \");\n    if (/lang|language|locale|jazyk|idioma|sprache|langue/i.test(text)) return true;\n    return Array.prototype.some.call(select.options || [], function (option) {\n      return normalizeLocale(option.value);\n    });\n  }\n\n  function ensureLocaleOptions(select) {\n    var hasLocaleOptions = Array.prototype.some.call(select.options || [], function (option) {\n      return normalizeLocale(option.value);\n    });\n\n    if (hasLocaleOptions) return;\n\n    if (select.id === \"langsel\" || /lang|locale|jazyk/i.test(select.id + \" \" + select.name + \" \" + select.className)) {\n      select.innerHTML = \"\";\n      LOCALES.forEach(function (locale) {\n        var option = document.createElement(\"option\");\n        option.value = locale;\n        option.textContent = LOCALE_LABELS[locale] || locale.toUpperCase();\n        select.appendChild(option);\n      });\n    }\n  }\n\n  function syncSelect(select) {\n    ensureLocaleOptions(select);\n    Array.prototype.forEach.call(select.options || [], function (option) {\n      var optionLocale = normalizeLocale(option.value);\n      if (optionLocale === currentLocale) {\n        option.selected = true;\n        select.value = option.value;\n      }\n    });\n    select.setAttribute(\"data-cai-route-locale-bound\", \"true\");\n  }\n\n  function syncControls() {\n    storeLocale(currentLocale);\n\n    Array.prototype.forEach.call(document.querySelectorAll(\"select\"), function (select) {\n      if (isLanguageSelect(select)) syncSelect(select);\n    });\n\n    Array.prototype.forEach.call(document.querySelectorAll(\"a[href]\"), function (link) {\n      var locale = localeFromHref(link.getAttribute(\"href\"));\n      if (!locale) return;\n      link.setAttribute(\"href\", routeFor(locale));\n      link.setAttribute(\"hreflang\", locale);\n      link.setAttribute(\"data-cai-route-locale-link\", locale);\n      if (locale === currentLocale) {\n        link.setAttribute(\"aria-current\", \"true\");\n        link.classList.add(\"active\", \"is-active\");\n      } else {\n        link.removeAttribute(\"aria-current\");\n        link.classList.remove(\"active\", \"is-active\");\n      }\n    });\n\n    Array.prototype.forEach.call(document.querySelectorAll(\"[data-locale], [data-lang], button\"), function (element) {\n      var locale = normalizeLocale(\n        element.getAttribute(\"data-locale\") ||\n        element.getAttribute(\"data-lang\") ||\n        element.value ||\n        element.textContent\n      );\n      if (!locale) return;\n      element.setAttribute(\"data-cai-route-locale-link\", locale);\n      if (locale === currentLocale) {\n        element.setAttribute(\"aria-current\", \"true\");\n        element.classList.add(\"active\", \"is-active\");\n      } else {\n        element.removeAttribute(\"aria-current\");\n        element.classList.remove(\"active\", \"is-active\");\n      }\n    });\n  }\n\n  document.addEventListener(\"click\", function (event) {\n    var target = event.target.closest && event.target.closest(\"a[href], [data-locale], [data-lang], button\");\n    if (!target) return;\n\n    var locale = normalizeLocale(\n      target.getAttribute(\"data-locale\") ||\n      target.getAttribute(\"data-lang\") ||\n      target.value ||\n      target.textContent\n    );\n\n    if (!locale && target.tagName === \"A\") locale = localeFromHref(target.getAttribute(\"href\"));\n    if (!locale) return;\n\n    event.preventDefault();\n    event.stopPropagation();\n    event.stopImmediatePropagation();\n    storeLocale(locale);\n    location.assign(routeFor(locale));\n  }, true);\n\n  document.addEventListener(\"change\", function (event) {\n    var target = event.target;\n    if (!isLanguageSelect(target)) return;\n\n    var locale = normalizeLocale(target.value);\n    if (!locale) return;\n\n    event.preventDefault();\n    event.stopPropagation();\n    event.stopImmediatePropagation();\n    storeLocale(locale);\n    location.assign(routeFor(locale));\n  }, true);\n\n  if (document.readyState === \"loading\") {\n    document.addEventListener(\"DOMContentLoaded\", syncControls);\n  } else {\n    syncControls();\n  }\n\n  setTimeout(syncControls, 0);\n  setTimeout(syncControls, 250);\n  setTimeout(syncControls, 1000);\n})();\n</script>";

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(file));
    if (entry.isFile() && file.endsWith(".html")) out.push(file);
  }
  return out;
}

function isTargetHtml(file) {
  const normalized = file.replace(/\\/g, "/");
  return PAGES.some((page) =>
    normalized.endsWith("/" + page + ".html") ||
    normalized.endsWith("/" + page + "/index.html")
  );
}

function removeBlockById(html, tag, id) {
  const openNeedle = "<" + tag + " id=\"" + id + "\"";
  const closeNeedle = "</" + tag + ">";
  let start = html.indexOf(openNeedle);
  while (start !== -1) {
    const openEnd = html.indexOf(">", start);
    if (openEnd === -1) break;
    const closeStart = html.indexOf(closeNeedle, openEnd + 1);
    if (closeStart === -1) break;
    const closeEnd = closeStart + closeNeedle.length;
    html = html.slice(0, start) + html.slice(closeEnd);
    start = html.indexOf(openNeedle);
  }
  return html;
}

function injectController(html) {
  html = removeBlockById(html, "script", "cai-url-locale-controller");
  html = removeBlockById(html, "style", "cai-url-locale-controller-css");

  const headClose = html.indexOf("</head>");
  if (headClose >= 0) {
    return html.slice(0, headClose) + CONTROLLER + "\n" + html.slice(headClose);
  }
  return CONTROLLER + "\n" + html;
}

for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (!isTargetHtml(file)) continue;
    const before = fs.readFileSync(file, "utf8");
    const after = injectController(before);
    if (after !== before) {
      fs.writeFileSync(file, after, "utf8");
      console.log("[url-locale-controller] patched", file);
    }
  }
}

console.log("URL locale controller enforcement applied.");
