function isBackToTopControl(target) {
  const control = target?.closest?.("button, a, [role='button'], [data-scroll-top], [data-back-to-top]");
  if (!control) return null;

  const text = String(control.textContent || "").trim();
  const attrs = [
    control.id || "",
    control.className || "",
    control.getAttribute("aria-label") || "",
    control.getAttribute("title") || "",
    control.getAttribute("href") || "",
    control.getAttribute("data-scroll-top") || "",
    control.getAttribute("data-back-to-top") || ""
  ].join(" ").toLowerCase();

  if (text === "↑" || text === "⬆" || text === "^") return control;
  if (/back[-_\\s]?to[-_\\s]?top|scroll[-_\\s]?to[-_\\s]?top|scrolltop|to[-_\\s]?top/.test(attrs)) return control;

  return null;
}

function scrollPageToTop(event) {
  const control = isBackToTopControl(event.target);
  if (!control) return;

  event.preventDefault();
  event.stopPropagation();

  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    window.scrollTo(0, 0);
  }
}

function prepareBackToTopControls() {
  document.querySelectorAll("button, a, [role='button'], [data-scroll-top], [data-back-to-top]").forEach((control) => {
    if (!isBackToTopControl(control)) return;

    if (control.tagName === "BUTTON" && !control.getAttribute("type")) {
      control.setAttribute("type", "button");
    }

    if (!control.getAttribute("aria-label")) {
      control.setAttribute("aria-label", "Back to top");
    }

    control.style.pointerEvents = "auto";
    control.style.cursor = "pointer";
    control.style.zIndex = "2147483647";
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("click", scrollPageToTop, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", prepareBackToTopControls);
  } else {
    prepareBackToTopControls();
  }

  window.addEventListener("load", prepareBackToTopControls);
  setTimeout(prepareBackToTopControls, 250);
  setTimeout(prepareBackToTopControls, 1000);
}
