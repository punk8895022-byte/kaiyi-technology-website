const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-button]");
const mobileMenu = document.querySelector("[data-mobile-menu]");
const progressBar = document.querySelector("[data-progress]");
const marquee = document.querySelector("[data-marquee]");
const navLinks = document.querySelectorAll("[data-nav] a");
const revealTargets = document.querySelectorAll(".reveal");
const contactForm = document.querySelector(".contact-form");
const yearSlot = document.querySelector("[data-year]");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- header state + scroll progress ---------- */

function syncScrollState() {
  header.classList.toggle("is-scrolled", window.scrollY > 24);

  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
  progressBar.style.transform = `scaleX(${Math.min(ratio, 1)})`;
}

syncScrollState();
window.addEventListener("scroll", syncScrollState, { passive: true });
window.addEventListener("resize", syncScrollState);

/* ---------- mobile menu ---------- */

function setMenu(isOpen) {
  mobileMenu.classList.toggle("is-open", isOpen);
  header.classList.toggle("is-open", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "關閉選單" : "開啟選單");
}

menuButton.addEventListener("click", () => {
  setMenu(!mobileMenu.classList.contains("is-open"));
});

mobileMenu.addEventListener("click", (event) => {
  if (event.target.matches("a")) {
    setMenu(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileMenu.classList.contains("is-open")) {
    setMenu(false);
    menuButton.focus();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 980) {
    setMenu(false);
  }
});

/* ---------- active nav highlighting ---------- */

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
      if (!link) return;

      if (entry.isIntersecting) {
        navLinks.forEach((item) => item.classList.remove("is-active"));
        link.classList.add("is-active");
      }
    });
  },
  { rootMargin: "-45% 0px -50% 0px" }
);

sectionMap.forEach((_link, section) => navObserver.observe(section));

/* ---------- reveal on scroll ---------- */

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);

revealTargets.forEach((target, index) => {
  target.style.transitionDelay = `${Math.min(index * 60, 240)}ms`;
  revealObserver.observe(target);
});

/* ---------- marquee: duplicate the track so the loop is seamless ---------- */

if (marquee && !prefersReducedMotion) {
  const track = marquee.querySelector(".marquee-track");
  if (track) {
    const clone = track.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    marquee.appendChild(clone);
  }
}

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
