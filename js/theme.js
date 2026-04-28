const STORAGE_KEY = "animes-rd-theme";
const DARK_CLASS = "dark-theme";

function getPreferredTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEY);
  if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
  return "dark";
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  document.body.classList.toggle(DARK_CLASS, isDark);
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-label", isDark ? "Ativar modo claro" : "Ativar modo noturno");
    button.setAttribute("title", isDark ? "Modo claro" : "Modo noturno");
    button.textContent = isDark ? "☀" : "☾";
  });
}

function setTheme(theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

applyTheme(getPreferredTheme());

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-theme-toggle]");
  if (!button) return;

  const nextTheme = document.body.classList.contains(DARK_CLASS) ? "light" : "dark";
  setTheme(nextTheme);
});
