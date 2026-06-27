(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function getScrollY() {
    return window.scrollY ||
      (document.scrollingElement && document.scrollingElement.scrollTop) ||
      (document.documentElement && document.documentElement.scrollTop) ||
      (document.body && document.body.scrollTop) ||
      0;
  }

  function forceTop() {
    const html = document.documentElement;
    const body = document.body;

    const oldHtmlBehavior = html ? html.style.scrollBehavior : "";
    const oldBodyBehavior = body ? body.style.scrollBehavior : "";

    if (html) html.style.scrollBehavior = "auto";
    if (body) body.style.scrollBehavior = "auto";

    try {
      window.scrollTo(0, 0);
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch (_) {
      try { window.scrollTo(0, 0); } catch (_) {}
    }

    const nodes = [document.scrollingElement, html, body];

    for (const node of nodes) {
      if (!node) continue;
      try {
        node.scrollTop = 0;
        node.scrollLeft = 0;
      } catch (_) {}
    }

    if (html) html.style.scrollBehavior = oldHtmlBehavior || "";
    if (body) body.style.scrollBehavior = oldBodyBehavior || "";
  }

  function ensureStyle() {
    if (document.getElementById("cai-fixed-backtop-css")) return;

    const style = document.createElement("style");
    style.id = "cai-fixed-backtop-css";
    style.textContent = `
#cai-fixed-backtop {
  position: fixed !important;
  right: 22px !important;
  bottom: 22px !important;
  width: 48px !important;
  height: 48px !important;
  border: 0 !important;
  border-radius: 999px !important;
  background: #1d1b1a !important;
  color: #fff !important;
  font-size: 22px !important;
  z-index: 2147483647 !important;
  cursor: pointer !important;
  display: none !important;
  align-items: center !important;
  justify-content: center !important;
  line-height: 1 !important;
}
#cai-fixed-backtop[data-show="true"] {
  display: flex !important;
}`;
    document.head.appendChild(style);
  }

  ready(function () {
    ensureStyle();

    let button = document.getElementById("cai-fixed-backtop");

    if (!button) {
      button = document.createElement("button");
      button.id = "cai-fixed-backtop";
      button.type = "button";
      button.textContent = "↑";
      button.setAttribute("aria-label", "Back to top");
      document.body.appendChild(button);
    }

    function updateVisibility() {
      button.setAttribute("data-show", getScrollY() > 120 ? "true" : "false");
    }

    function handleClick(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      forceTop();
      requestAnimationFrame(forceTop);
      setTimeout(forceTop, 50);
      setTimeout(forceTop, 150);
      setTimeout(forceTop, 400);
      setTimeout(updateVisibility, 450);
    }

    button.addEventListener("click", handleClick, true);
    button.addEventListener("pointerup", handleClick, true);
    button.addEventListener("touchend", handleClick, true);

    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("load", updateVisibility);

    updateVisibility();
  });
})();
