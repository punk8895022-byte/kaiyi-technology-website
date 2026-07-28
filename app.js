const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-button]");
const drawer = document.querySelector("[data-drawer]");
const navLinks = document.querySelectorAll("[data-nav] a");
const revealTargets = document.querySelectorAll(".reveal");
const contactForm = document.querySelector(".contact-form");
const yearSlot = document.querySelector("[data-year]");

/* ---------- header ---------- */

function syncHeader() {
  header.classList.toggle("is-scrolled", window.scrollY > 16);
}

syncHeader();
window.addEventListener("scroll", syncHeader, { passive: true });

/* ---------- drawer ---------- */

function setDrawer(isOpen) {
  drawer.classList.toggle("is-open", isOpen);
  header.classList.toggle("is-open", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "關閉選單" : "開啟選單");
}

menuButton.addEventListener("click", () => {
  setDrawer(!drawer.classList.contains("is-open"));
});

drawer.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    setDrawer(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && drawer.classList.contains("is-open")) {
    setDrawer(false);
    menuButton.focus();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 940) {
    setDrawer(false);
  }
});

/* ---------- active nav ---------- */

const sectionMap = new Map();

navLinks.forEach((link) => {
  const section = document.querySelector(link.getAttribute("href"));
  if (section) {
    sectionMap.set(section, link);
  }
});

const navObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const link = sectionMap.get(entry.target);
      if (!link || !entry.isIntersecting) return;

      navLinks.forEach((item) => item.classList.remove("is-active"));
      link.classList.add("is-active");
    });
  },
  { rootMargin: "-45% 0px -50% 0px" }
);

sectionMap.forEach((_link, section) => navObserver.observe(section));

/* ---------- restrained fade-in ---------- */

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

revealTargets.forEach((target, index) => {
  target.style.transitionDelay = `${Math.min(index * 40, 160)}ms`;
  revealObserver.observe(target);
});

/* ---------- footer year ---------- */

if (yearSlot) {
  yearSlot.textContent = String(new Date().getFullYear());
}

/* ---------- contact form (front-end demo only) ---------- */

contactForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const button = contactForm.querySelector("button");
  const originalText = button.textContent;

  button.textContent = "已收到，待正式串接";
  button.disabled = true;

  window.setTimeout(() => {
    button.textContent = originalText;
    button.disabled = false;
  }, 2400);
});
