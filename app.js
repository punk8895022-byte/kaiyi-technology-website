/* ---------- element lookups: every one is treated as optional ----------
   Nothing here may throw when an element is missing. The previous version
   dereferenced [data-header] on line 15 of 116, so a single absent element
   killed the remaining 100 lines — and because .reveal starts at opacity:0,
   that left most of the page permanently invisible. 404.html had to ship
   without any script at all to work around it.                            */

const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-button]");
const drawer = document.querySelector("[data-drawer]");
const navLinks = Array.from(document.querySelectorAll("[data-nav] a"));
const revealTargets = Array.from(document.querySelectorAll(".reveal"));
const contactForm = document.querySelector(".contact-form");
const formStatus = document.querySelector("[data-form-status]");
const yearSlot = document.querySelector("[data-year]");

/* Done first so it can never be starved by a failure further down. */
if (yearSlot) {
  yearSlot.textContent = String(new Date().getFullYear());
}

/* ---------- header ---------- */

if (header) {
  const syncHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 16);
  syncHeader();
  window.addEventListener("scroll", syncHeader, { passive: true });
}

/* ---------- drawer ---------- */

if (menuButton && drawer) {
  // State lives in a variable rather than the DOM so setDrawer can no-op
  // cheaply when nothing actually changed.
  let drawerOpen = false;

  const setDrawer = (isOpen) => {
    if (isOpen === drawerOpen) return;
    drawerOpen = isOpen;
    drawer.classList.toggle("is-open", isOpen);
    if (header) header.classList.toggle("is-open", isOpen);
    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "關閉選單" : "開啟選單");
  };

  menuButton.addEventListener("click", () => setDrawer(!drawerOpen));

  drawer.addEventListener("click", (event) => {
    if (event.target.closest("a")) setDrawer(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawerOpen) {
      setDrawer(false);
      menuButton.focus();
    }
  });

  // rAF-throttled, and setDrawer early-returns when the state is unchanged,
  // so a drag-resize that never crosses the breakpoint costs nothing.
  let resizeQueued = false;
  window.addEventListener(
    "resize",
    () => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        if (window.innerWidth > 940) setDrawer(false);
      });
    },
    { passive: true }
  );
}

/* ---------- active nav ---------- */

if (navLinks.length && "IntersectionObserver" in window) {
  const sectionMap = new Map();

  navLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    // getElementById, not querySelector: querySelector("#") throws a
    // SyntaxError, and thrown here it would take every observer below with it.
    if (!href.startsWith("#") || href.length < 2) return;
    const section = document.getElementById(decodeURIComponent(href.slice(1)));
    if (section) sectionMap.set(section, link);
  });

  if (sectionMap.size) {
    // INVARIANT: TOP_CUT + BOTTOM_CUT must stay below 100. At 100 the
    // detection band has zero height, the observer never fires, and nav
    // highlighting dies silently with no error anywhere.
    const TOP_CUT = 45;
    const BOTTOM_CUT = 50;

    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const link = sectionMap.get(entry.target);
          if (!link || !entry.isIntersecting) return;
          navLinks.forEach((item) => item.classList.remove("is-active"));
          link.classList.add("is-active");
        });
      },
      { rootMargin: `-${TOP_CUT}% 0px -${BOTTOM_CUT}% 0px` }
    );

    sectionMap.forEach((_link, section) => navObserver.observe(section));
  }
}

/* ---------- restrained fade-in ---------- */

if (revealTargets.length) {
  if (!("IntersectionObserver" in window)) {
    // Never leave content at opacity:0 just because the browser lacks the API.
    revealTargets.forEach((target) => target.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      // threshold alone never fires for an element taller than the viewport;
      // the negative bottom margin makes the trigger positional as well.
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    revealTargets.forEach((target, index) => {
      target.style.transitionDelay = `${Math.min(index * 40, 160)}ms`;
      revealObserver.observe(target);
    });
  }
}

/* ---------- contact form (front-end demo only) ---------- */

if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    // The status goes to a live region rather than the button label: disabling
    // the focused button would drop keyboard focus to <body>, and the old
    // disabled style rendered the confirmation at 2.09:1 contrast.
    if (formStatus) {
      formStatus.textContent = "已收到您填寫的內容。此為前端示範，尚未實際送出。";
    }
  });
}
