const currentPage = window.location.pathname.split("/").pop() || "index.html";

if (currentPage !== "ciel.html" && currentPage !== "dashboard.html") {
  const link = document.createElement("a");
  link.className = "nyx-floating-link";
  link.href = "ciel.html";
  link.setAttribute("aria-label", "Abrir Ciel");
  link.title = "Ciel — Grande Sábia";
  link.innerHTML = `
    <img src="assets/ciel-icon.png" alt="Ciel" width="64" height="64" decoding="async" />
  `;
  document.body.appendChild(link);
}
