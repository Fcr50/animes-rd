// js/table.js
import { supabase } from './supabase-client.js';
import { getGroupId, normalizeText, escapeHTML, stripEmoji } from './utils.js';
import { loadData, notaColor, getPersonNota, getPersonColor } from './data.js';

let allAnimes = [];
let filtered = [];
let sortCol = "notaSort";
let sortDir = -1;
let currentModalIndex = null;
let currentUser = null;
let members = [];

/**
 * Inicializa a tabela carregando os dados do grupo.
 */
export async function initTable() {
  const data = await loadData();
  allAnimes = data.animes;
  members = data.members;
  filtered = [...allAnimes];

  renderFilters();
  renderTable();
  renderModal();
  
  // Escuta mudanças de auth para habilitar edição
  supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    refreshModal();
  });
}

function renderFilters() {
  const wrap = document.getElementById("filters");
  if (!wrap) return;

  // Coleta gêneros únicos
  const genreMap = new Map();
  allAnimes.forEach(a => {
    (a.generos || []).forEach(g => {
      const clean = stripEmoji(g);
      if (!genreMap.has(clean) || g.length > genreMap.get(clean).length) {
        genreMap.set(clean, g);
      }
    });
  });

  const genres = [...genreMap.values()].sort();

  wrap.innerHTML = `
    <input type="text" id="search" placeholder="🔍  Buscar anime..." />
    <select id="filter-genre">
      <option value="">Todos os gêneros</option>
      ${genres.map(g => `<option value="${g}">${g}</option>`).join("")}
    </select>
    <select id="filter-status">
      <option value="">Status (Qualquer)</option>
      <option value="watched">Que eu assisti</option>
      <option value="not-watched">Que eu NÃO assisti</option>
    </select>
  `;

  wrap.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", applyFilters);
  });
}

function applyFilters() {
  const search = document.getElementById("search")?.value.toLowerCase() || "";
  const genre = document.getElementById("filter-genre")?.value || "";
  const status = document.getElementById("filter-status")?.value || "";

  filtered = allAnimes.filter(a => {
    if (search && !a.name.toLowerCase().includes(search)) return false;
    if (genre && !(a.generos || []).includes(genre)) return false;
    
    if (status && currentUser) {
      const myMember = members.find(m => m.user_id === currentUser.id);
      if (myMember) {
        const watched = a.quemAssistiu.includes(myMember.nickname);
        if (status === 'watched' && !watched) return false;
        if (status === 'not-watched' && watched) return false;
      }
    }
    return true;
  });

  sortData();
  renderTable();
}

function sortData() {
  filtered.sort((a, b) => {
    let va = a[sortCol];
    let vb = b[sortCol];
    if (va == null) va = -Infinity;
    if (vb == null) vb = -Infinity;
    return sortDir * (va < vb ? -1 : va > vb ? 1 : 0);
  });
}

function renderTable() {
  const tbody = document.getElementById("anime-tbody");
  if (!tbody) return;

  tbody.innerHTML = filtered.map((a, i) => {
    const nota = a.nota || "—";
    const notaCls = notaColor(a.nota);
    const viewers = a.quemAssistiu.map(p => {
      const color = getPersonColor(p);
      return `<span class="badge" style="background: ${color}22; color: ${color}">${p}</span>`;
    }).join("");

    return `
      <tr onclick="window.openModal(${allAnimes.indexOf(a)})">
        <td>${escapeHTML(a.name)}</td>
        <td>${(a.generos || []).slice(0, 2).join(", ")}</td>
        <td>${viewers}</td>
        <td><span class="nota ${notaCls}">${nota}</span></td>
        <td>${a.qtdVotos}</td>
        <td>${a.controversia}</td>
      </tr>
    `;
  }).join("");
}

function renderModal() {
  if (document.getElementById("modal-overlay")) return;
  const div = document.createElement("div");
  div.id = "modal-overlay";
  div.className = "modal-overlay";
  div.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2 id="modal-title"></h2>
        <button onclick="closeModal()">✕</button>
      </div>
      <div id="modal-body"></div>
    </div>
  `;
  document.body.appendChild(div);
}

window.openModal = function(idx) {
  const a = allAnimes[idx];
  if (!a) return;
  currentModalIndex = idx;
  
  document.getElementById("modal-title").textContent = a.name;
  const body = document.getElementById("modal-body");
  
  body.innerHTML = `
    <div class="modal-info">
      <p><strong>Gêneros:</strong> ${a.generos?.join(", ")}</p>
      <p><strong>Média:</strong> ${a.nota || "—"}</p>
    </div>
    <div class="modal-votes">
      ${members.map(m => {
        const nota = a[`nota${m.nickname}`] || "—";
        return `<div><strong>${m.nickname}:</strong> ${nota}</div>`;
      }).join("")}
    </div>
    <div class="modal-comments">
      <h3>Comentários</h3>
      <pre>${a.comentarios || "Sem comentários."}</pre>
    </div>
  `;

  document.getElementById("modal-overlay").classList.add("open");
};

window.closeModal = function() {
  document.getElementById("modal-overlay").classList.remove("open");
};

function refreshModal() {
  if (currentModalIndex !== null) window.openModal(currentModalIndex);
}
