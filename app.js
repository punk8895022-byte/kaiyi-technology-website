const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-button]");
const mobileMenu = document.querySelector("[data-mobile-menu]");
const revealTargets = document.querySelectorAll(".reveal");
const contactForm = document.querySelector(".contact-form");

function syncHeaderState() {
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}

function closeMenu() {
  mobileMenu.classList.remove("is-open");
  header.classList.remove("is-open");
  menuButton.setAttribute("aria-expanded", "false");
}

syncHeaderState();
window.addEventListener("scroll", syncHeaderState, { passive: true });

menuButton.addEventListener("click", () => {
  const isOpen = mobileMenu.classList.toggle("is-open");
  header.classList.toggle("is-open", isOpen);
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

mobileMenu.addEventListener("click", (event) => {
  if (event.target.matches("a")) {
    closeMenu();
  }
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.18 }
);

revealTargets.forEach((target, index) => {
  target.style.transitionDelay = `${Math.min(index * 45, 180)}ms`;
  observer.observe(target);
});

contactForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const button = contactForm.querySelector("button");
  const originalText = button.textContent;
  button.textContent = "已收到，待正式串接";
  button.disabled = true;

  window.setTimeout(() => {
    button.textContent = originalText;
    button.disabled = false;
  }, 2200);
});
