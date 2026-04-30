// js/utils.js

/**
 * Carrega a navbar dinamicamente e marca o link ativo.
 * Retorna uma promessa que resolve quando a navbar estiver no DOM.
 */
export async function loadNavbar() {
  const nav = document.querySelector("nav.nav");
  if (!nav) return;

  try {
    const response = await fetch("navbar.html");
    if (!response.ok) throw new Error("Falha ao carregar navbar.html");
    const html = await response.text();
    nav.innerHTML = html;

    // Marca o link ativo com base na URL atual
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    const links = nav.querySelectorAll("a");

    links.forEach((link) => {
      const href = link.getAttribute("href");
      if (href === currentPath) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    // Dispara um evento customizado para avisar que a navbar carregou
    // (Útil para o suggest.js que precisa do #user-nav)
    document.dispatchEvent(new CustomEvent("navbar-loaded"));
  } catch (error) {
    console.error("Erro ao carregar a navbar:", error);
  }
}

// Inicializa automaticamente se for importado
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadNavbar);
} else {
  loadNavbar();
}
