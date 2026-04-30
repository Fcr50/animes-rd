export function escapeHTML(value) {
  return String(value == null ? "" : value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
}

export function normalizeText(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function stripEmoji(value) {
  return String(value == null ? "" : value)
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2702}-\u{27B0}]/gu, "")
    .trim();
}

export function hexToRgba(hex, alpha = 1) {
  const cleanHex = String(hex).replace("#", "");
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function shortText(value, size = 44) {
  const text = String(value == null ? "" : value);
  return text.length > size ? `${text.slice(0, size - 1)}...` : text;
}

export function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

export function formatDateTimeBR(value) {
  const date = new Date(value);
  return {
    date,
    dateText: date.toLocaleDateString("pt-BR"),
    timeText: date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

export async function loadNavbar() {
  const nav = document.querySelector("nav.nav");
  if (!nav) return;

  try {
    const response = await fetch("navbar.html?v=featured-30min-1");
    if (!response.ok) throw new Error("Falha ao carregar navbar.html");

    nav.innerHTML = await response.text();

    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    nav.querySelectorAll("a.nav-link, .nav-person a").forEach((link) => {
      link.classList.toggle("active", link.getAttribute("href") === currentPath);
    });

    document.dispatchEvent(new CustomEvent("navbar-loaded"));
  } catch (error) {
    console.error("Erro ao carregar a navbar:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadNavbar);
} else {
  loadNavbar();
}
