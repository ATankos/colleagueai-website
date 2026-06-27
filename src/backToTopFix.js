(function () {
  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      callback();
    }
  }

  function currentScrollY() {
    return window.scrollY ||
      (document.scrollingElement && document.scrollingElement.scrollTop) ||
      (document.documentElement && document.documentElement.scrollTop) ||
      (document.body && document.body.scrollTop) ||
      0;
  }

  function forceTop() {
    var html = document.documentElement;
    var body = document.body;
    var oldHtmlBehavior = html ? html.style.scrollBehavior : "";
    var oldBodyBehavior = body ? body.style.scrollBehavior : "";

    if (html) html.style.scrollBehavior = "auto";
    if (body) body.style.scrollBehavior = "auto";

    try {
      window.scrollTo(0, 0);
    } catch (error) {}

    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch (error) {}

    var nodes = [document.scrollingElement, html, body];

    for (var i = 0; i < nodes.length; i += 1) {
      if (!nodes[i]) continue;

      try {
        nodes[i].scrollTop = 0;
        nodes[i].scrollLeft = 0;
      } catch (error) {}
    }

    if (html) html.style.scrollBehavior = oldHtmlBehavior || "";
    if (body) body.style.scrollBehavior = oldBodyBehavior || "";
  }

  function ensureStyle() {
    if (document.getElementById("cai-fixed-backtop-css")) return;

    var style = document.createElement("style");
    style.id = "cai-fixed-backtop-css";
    style.textContent = [
      "#cai-fixed-backtop {",
      "position: fixed !important;",
      "right: 22px !important;",
      "bottom: 22px !important;",
      "width: 48px !important;",
      "height: 48px !important;",
      "border: 0 !important;",
      "border-radius: 999px !important;",
      "background: #1d1b1a !important;",
      "color: #fff !important;",
      "font-size: 22px !important;",
      "z-index: 2147483647 !important;",
      "cursor: pointer !important;",
      "display: none !important;",
      "align-items: center !important;",
      "justify-content: center !important;",
      "line-height: 1 !important;",
      "}",
      "#cai-fixed-backtop[data-show='true'] {",
      "display: flex !important;",
      "}"
    ].join("\n");

    document.head.appendChild(style);
  }

  function ensureButton() {
    var button = document.getElementById("cai-fixed-backtop");

    if (!button) {
      button = document.createElement("button");
      button.id = "cai-fixed-backtop";
      button.type = "button";
      button.textContent = "Back to top";
      button.setAttribute("aria-label", "Back to top");
      document.body.appendChild(button);
    }

    return button;
  }

  onReady(function () {
    ensureStyle();

    var button = ensureButton();

    function updateVisibility() {
      button.setAttribute("data-show", currentScrollY() > 120 ? "true" : "false");
    }

    function handleClick(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      forceTop();

      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(forceTop);
      }

      window.setTimeout(forceTop, 50);
      window.setTimeout(forceTop, 150);
      window.setTimeout(forceTop, 400);
      window.setTimeout(updateVisibility, 450);
    }

    button.addEventListener("click", handleClick, true);
    button.addEventListener("pointerup", handleClick, true);
    button.addEventListener("touchend", handleClick, true);

    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("load", updateVisibility);

    updateVisibility();
  });
})();
