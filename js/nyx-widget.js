// js/nyx-widget.js

function initNyxWidget() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  const hash = window.location.hash;
  const search = window.location.search;

  // 1. Não mostrar na própria página da Ciel
  if (path === "ciel.html") return;

  // 2. Não mostrar na Dashboard (index.html ou raiz) se não houver um grupo selecionado
  // O usuário quer que só apareça dentro do contexto de um grupo.
  const hasGroup = hash.includes("g=") || search.includes("g=");
  
  // Se for a index.html (dashboard) E não tiver grupo na URL, esconde.
  if ((path === "index.html" || path === "") && !hasGroup) return;

  // 3. Criar o link flutuante
  const link = document.createElement("a");
  link.className = "nyx-floating-link";
  link.href = "ciel.html";
  link.setAttribute("aria-label", "Abrir Ciel");
  link.title = "Ciel — Grande Sábia";
  link.innerHTML = `
    <img src="assets/ciel-icon.png" alt="Ciel" width="64" height="64" decoding="async" />
  `;

  // Mantém o contexto do grupo ao clicar no ícone da Ciel
  if (hasGroup) {
    const groupId = new URLSearchParams(hash.substring(1) || search).get("g");
    if (groupId) link.href += `#g=${groupId}`;
  }

  document.body.appendChild(link);
}

initNyxWidget();
