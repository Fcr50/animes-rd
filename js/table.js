// js/table.js — tabela com filtros, ordenação e modal

import { formatNota, notaColor, PEOPLE, PERSON_LIGHTS } from "./data.js";

let allAnimes = [];
let filtered = [];
let sortCol = "notaSort";
let sortDir = -1;

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function commentsForAnime(anime) {
  if (Array.isArray(anime.comments) && anime.comments.length) {
    return anime.comments.filter((comment) => comment?.text);
  }

  if (!anime.comentarios) return [];

  const peoplePattern = PEOPLE.join("|");
  const linePattern = new RegExp(`^\\s*(${peoplePattern})\\s*[:\\-–—]\\s*(.+)$`, "i");
  return String(anime.comentarios)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(linePattern);
      if (!match) return { person: null, text: line };
      const person = PEOPLE.find((p) => normalizeName(p) === normalizeName(match[1]));
      return { person, text: match[2].trim() };
    })
    .filter((comment) => comment.text);
}

export function initTable(animes) {
  allAnimes = animes;
  filtered = [...animes];
  renderFilters();
  renderTable();
  renderModal();
}

function renderFilters() {
  const wrap = document.getElementById("filters");
  if (!wrap) return;

  // Coleta gêneros únicos
  const genreSet = new Set();
  allAnimes.forEach((a) => a.generos.forEach((g) => genreSet.add(g)));
  const genres = [...genreSet].sort();

  wrap.innerHTML = `
    <input type="text" id="search" placeholder="🔍  Buscar anime..." />
    <select id="filter-genre">
      <option value="">Todos os gêneros</option>
      ${genres.map((g) => `<option value="${g}">${g}</option>`).join("")}
    </select>
    <select id="filter-person">
      <option value="">Todos</option>
      ${PEOPLE.map((p) => `<option value="${p}">${p}</option>`).join("")}
    </select>
    <select id="filter-votes">
      <option value="">Qtd. votos</option>
      <option value="4">4 votos</option>
      <option value="3">3 votos</option>
      <option value="2">2 votos</option>
      <option value="1">1 voto</option>
    </select>
  `;

  wrap.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", applyFilters);
  });
}

function applyFilters() {
  const search = document.getElementById("search")?.value.toLowerCase() || "";
  const genre = document.getElementById("filter-genre")?.value || "";
  const person = document.getElementById("filter-person")?.value || "";
  const votes = document.getElementById("filter-votes")?.value || "";

  filtered = allAnimes.filter((a) => {
    if (search && !a.nome.toLowerCase().includes(search)) return false;
    if (genre && !a.generos.includes(genre)) return false;
    if (person && !a.quemAssistiu.includes(person)) return false;
    if (votes && String(a.qtdVotos) !== votes) return false;
    return true;
  });

  sortData();
  renderTable();
}

function sortData() {
  filtered.sort((a, b) => {
    let va = a[sortCol];
    let vb = b[sortCol];
    if (va === null || va === undefined) va = -Infinity;
    if (vb === null || vb === undefined) vb = -Infinity;
    if (typeof va === "string") return sortDir * va.localeCompare(vb);
    return sortDir * (va - vb);
  });
}

function renderTable() {
  const tbody = document.getElementById("anime-tbody");
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--faint)">Nenhum anime encontrado</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((a, i) => {
    const nota = a.nota !== null ? Number(a.nota).toFixed(2) : "—";
    const notaCls = notaColor(a.nota);
    const genres = a.generos.slice(0, 2).map((g) => `<span class="badge badge-genre">${g}</span>`).join("");
    const moreGenres = a.generos.length > 2 ? `<span class="badge badge-genre">+${a.generos.length - 2}</span>` : "";
    const viewers = a.quemAssistiu.map((p) => `<span class="badge badge-${p.toLowerCase()}">${p}</span>`).join("");
    const contr = a.controversia !== null ? Number(a.controversia).toFixed(1) : "—";
    const contrCls = a.controversia > 1.5 ? "controversia-hot" : "controversia";
    const comments = commentsForAnime(a);
    const commentSummary = comments.length
      ? `<span class="comment-pill">${comments.length} ${comments.length === 1 ? "comentário" : "comentários"}</span>`
      : `<span class="comment-empty">—</span>`;

    return `
      <tr data-idx="${i}" onclick="openModal(${allAnimes.indexOf(a)})">
        <td><span class="anime-name">${escapeHTML(a.nome)}</span></td>
        <td>${genres}${moreGenres}</td>
        <td>${viewers}</td>
        <td><span class="nota ${notaCls}">${nota}</span></td>
        <td>${a.qtdVotos ?? "—"}</td>
        <td>${commentSummary}</td>
        <td><span class="${contrCls}">${contr > 0 ? "🌶️ " + contr : contr}</span></td>
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
    <div class="modal" id="modal-content">
      <div class="modal-header">
        <h2 class="modal-title" id="modal-title"></h2>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div id="modal-genres" class="modal-genres"></div>
      <div class="notes-grid" id="modal-notes"></div>
      <div id="modal-meta" class="modal-meta"></div>
      <div id="modal-comment"></div>
    </div>
  `;
  div.addEventListener("click", (e) => { if (e.target === div) closeModal(); });
  document.body.appendChild(div);
}

window.openModal = function(idx) {
  const a = allAnimes[idx];
  if (!a) return;

  document.getElementById("modal-title").textContent = a.nome;

  document.getElementById("modal-genres").innerHTML =
    a.generos.map((g) => `<span class="badge badge-genre">${g}</span>`).join(" ");

  const notas = [
    { person: "Rafael", nota: a.notaRafael, color: PERSON_LIGHTS.Rafael },
    { person: "Fernando", nota: a.notaFernando, color: PERSON_LIGHTS.Fernando },
    { person: "Dudu", nota: a.notaDudu, color: PERSON_LIGHTS.Dudu },
    { person: "Hacksuya", nota: a.notaHacksuya, color: PERSON_LIGHTS.Hacksuya },
  ];

  document.getElementById("modal-notes").innerHTML = notas.map((n) => `
    <div class="note-box">
      <div class="person" style="color:${n.color}">${n.person}</div>
      <div class="score ${n.nota === null ? 'empty' : notaColor(n.nota)}">
        ${n.nota !== null ? Number(n.nota).toFixed(1) : "—"}
      </div>
    </div>
  `).join("");

  const metaItems = [];
  if (a.nota !== null) metaItems.push(`Média: <span>${Number(a.nota).toFixed(2)}</span>`);
  if (a.controversia !== null) {
    const hot = a.controversia > 1.5 ? "🌶️ " : "";
    metaItems.push(`Controvérsia: <span>${hot}${Number(a.controversia).toFixed(1)}</span>`);
  }
  if (a.qtdVotos !== null) metaItems.push(`Votos: <span>${a.qtdVotos}</span>`);

  document.getElementById("modal-meta").innerHTML =
    metaItems.map((m) => `<span class="meta-item">${m}</span>`).join("");

  const commentEl = document.getElementById("modal-comment");
  commentEl.innerHTML = renderComments(a);

  document.getElementById("modal-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
};

function renderComments(anime) {
  const comments = commentsForAnime(anime);
  if (!comments.length) return "";

  return `
    <section class="modal-comments">
      <h3>Comentários</h3>
      <div class="comment-list">
        ${comments.map((comment) => {
          const person = comment.person || "Comentário";
          const color = PERSON_LIGHTS[person] || "var(--muted)";
          return `
            <article class="comment-item">
              <strong style="color:${color}">${escapeHTML(person)}</strong>
              <p>${escapeHTML(comment.text)}</p>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

window.closeModal = function() {
  document.getElementById("modal-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
};

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.closeModal();
});

// Sorting via column headers
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("thead th[data-col]").forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir *= -1;
      } else {
        sortCol = col;
        sortDir = -1;
      }
      document.querySelectorAll("thead th").forEach((h) => h.classList.remove("sorted"));
      th.classList.add("sorted");
      sortData();
      renderTable();
    });
  });
});
