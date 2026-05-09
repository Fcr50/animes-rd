// js/nyx-widget.js

function initNyxWidget() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  const hash = window.location.hash;
  const search = window.location.search;

  // 1. Não mostrar na própria página da Ciel
  if (path === "ciel.html") return;

  // 2. Verificar se existe contexto de grupo (g=)
  const hasGroup = hash.includes("g=") || search.includes("g=");

  // 3. Regra de visibilidade:
  // Se estiver na index (Dashboard) e NÃO tiver grupo selecionado, esconde.
  if ((path === "index.html" || path === "") && !hasGroup) return;
  
  // Também não mostrar se explicitamente estiver na dashboard antiga (caso ainda exista no cache)
  if (path === "dashboard.html" && !hasGroup) return;

  // 4. Criar o link flutuante
  const link = document.createElement("a");
  link.className = "nyx-floating-link";
  link.href = "ciel.html";
  link.setAttribute("aria-label", "Abrir Ciel");
  link.title = "Ciel — Grande Sábia";
  link.innerHTML = `
    <img src="assets/ciel-icon.png" alt="Ciel" width="64" height="64" decoding="async" />
  `;

  // 5. Preservar o contexto do grupo ao navegar para a Ciel
  if (hasGroup) {
    const params = new URLSearchParams(hash.substring(1) || search);
    const groupId = params.get("g");
    if (groupId) {
      link.href += `#g=${groupId}`;
    }
  }

  document.body.appendChild(link);
}

initNyxWidget();
