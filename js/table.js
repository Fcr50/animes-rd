// js/table.js
import { supabase } from './supabase-client.js';
import { getGroupId, normalizeText, escapeHTML, stripEmoji, shortText } from './utils.js';
import { loadData, notaColor, formatNota, getPersonColor, invalidateCache } from './data.js';

let allAnimes = [];
let filtered = [];
let members = [];
let currentUser = null;
let currentModalIndex = null;

// Ordenação inicial: Nota DESC
let sortCol = "notaSort";
let sortDir = -1;

export async function initTable() {
  const data = await loadData();
  allAnimes = data.animes;
  members = data.members;
  filtered = [...allAnimes];

  sortData();
  renderFilters();
  renderTable();
  renderModal();

  // Verifica se há instrução de abrir um modal específico vindo do Blog
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const openMalId = hashParams.get('open');
  if (openMalId) {
    const idx = allAnimes.findIndex(a => String(a.mal_id) === openMalId);
    if (idx !== -1) {
      setTimeout(() => window.openModal(idx), 300);
    }
  }

  supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    refreshModal();
  });
}

function sortData() {
  filtered.sort((a, b) => {
    const valA = a[sortCol];
    const valB = b[sortCol];

    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    if (typeof valA === "string") {
      return valA.localeCompare(valB) * sortDir;
    }
    return (valA - valB) * sortDir;
  });
}

function renderFilters() {
  const genres = [...new Set(allAnimes.flatMap(a => a.genres || []))].sort();
  const genreSelect = document.getElementById("filter-genre");
  if (genreSelect) {
    genreSelect.innerHTML = '<option value="">Todos os Gêneros</option>';
    genres.forEach(g => {
      const option = document.createElement("option");
      option.value = g;
      option.textContent = g;
      genreSelect.appendChild(option);
    });
    genreSelect.addEventListener("change", applyFilters);
  }

  const statusSelect = document.getElementById("filter-status");
  if (statusSelect) {
    statusSelect.addEventListener("change", applyFilters);
  }

  const searchInput = document.getElementById("search-anime");
  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
  }
}

function applyFilters() {
  const genre = document.getElementById("filter-genre")?.value;
  const status = document.getElementById("filter-status")?.value;
  const search = normalizeText(document.getElementById("search-anime")?.value || "");

  filtered = allAnimes.filter(a => {
    const matchesGenre = !genre || (a.genres || []).includes(genre);
    const matchesSearch = !search || normalizeText(a.name).includes(search);
    
    let matchesStatus = true;
    if (status === "watched" && currentUser) {
      matchesStatus = a.quemAssistiu.includes(members.find(m => m.user_id === currentUser.id)?.nickname);
    } else if (status === "not-watched" && currentUser) {
      matchesStatus = !a.quemAssistiu.includes(members.find(m => m.user_id === currentUser.id)?.nickname);
    }

    return matchesGenre && matchesSearch && matchesStatus;
  });

  sortData();
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("anime-table-body");
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-msg">Nenhum anime encontrado com esses filtros.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((anime, index) => {
    const originalIndex = allAnimes.indexOf(anime);
    const scoresHtml = members.map(m => {
      const nota = anime[`nota${m.nickname}`];
      return `<td class="col-score ${notaColor(nota)}">${formatNota(nota)}</td>`;
    }).join("");

    const dubBadge = anime.links?.dublado ? '<span class="dub-tag" title="Dublado PT-BR">D</span>' : '';

    return `
      <tr onclick="window.openModal(${originalIndex})">
        <td class="col-anime">
          <div class="anime-identity">
            <img src="${anime.image_url}" class="anime-thumb" loading="lazy">
            <div class="anime-info">
              <span class="anime-name">${escapeHTML(anime.name)} ${dubBadge}</span>
              <span class="anime-genres">${(anime.genres || []).slice(0, 3).join(", ")}</span>
            </div>
          </div>
        </td>
        <td class="col-avg ${notaColor(anime.notaSort)}">${formatNota(anime.notaSort)}</td>
        ${scoresHtml}
      </tr>
    `;
  }).join("");
}

// ── Modal Logic ──────────────────────────────────────────────────────────────

function renderModal() {
  const modal = document.createElement("div");
  modal.id = "anime-modal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="window.closeModal()"></div>
    <div class="modal-content">
      <button class="modal-close" onclick="window.closeModal()">×</button>
      <div id="modal-body"></div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.openModal = (index) => {
  currentModalIndex = index;
  const anime = allAnimes[index];
  const modal = document.getElementById("anime-modal");
  const body = document.getElementById("modal-body");
  if (!modal || !body || !anime) return;

  const dubStatus = anime.links?.dublado ? 'Sim ✅' : 'Não ❌';

  body.innerHTML = `
    <div class="anime-detail-header">
      <img src="${anime.image_url}" class="detail-poster">
      <div class="detail-main">
        <h1>${escapeHTML(anime.name)}</h1>
        <div class="detail-tags">
          ${(anime.genres || []).map(g => `<span class="genre-tag">${g}</span>`).join("")}
          <span class="genre-tag dub-badge">Dublado: ${dubStatus}</span>
        </div>
        <div class="detail-stats">
          <div class="stat-item">
            <span class="stat-label">Média</span>
            <span class="stat-value ${notaColor(anime.notaSort)}">${formatNota(anime.notaSort)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Votos</span>
            <span class="stat-value">${anime.qtdVotos}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-column">
        <h3>Notas do Grupo</h3>
        <div class="scores-list">
          ${members.map(m => {
            const nota = anime[`nota${m.nickname}`];
            const comment = anime.comentarios.split('\n')
              .find(c => c.startsWith(`${m.nickname}:`))
              ?.replace(`${m.nickname}:`, "").trim();

            return `
              <div class="score-card">
                <div class="score-card-header">
                  <span class="member-name" style="color:${m.color}">${m.nickname}</span>
                  <span class="member-score ${notaColor(nota)}">${formatNota(nota)}</span>
                </div>
                ${comment ? `<p class="member-comment">"${escapeHTML(comment)}"</p>` : ""}
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <div class="detail-column">
        <h3>Links e Mídia</h3>
        <div id="links-container" class="links-grid">
          ${renderLinks(anime.links)}
        </div>
        
        <div id="user-vote-section" class="user-vote-area">
          <!-- Preenchido via refreshModal() -->
        </div>
      </div>
    </div>
  `;

  modal.classList.add("open");
  refreshModal();
};

window.closeModal = () => {
  document.getElementById("anime-modal")?.classList.remove("open");
  currentModalIndex = null;
};

function refreshModal() {
  if (currentModalIndex === null) return;
  const anime = allAnimes[currentModalIndex];
  const container = document.getElementById("user-vote-section");
  if (!container) return;

  if (!currentUser) {
    container.innerHTML = `<button class="btn btn-primary" onclick="window.supabaseLogin()">Logar para votar</button>`;
    return;
  }

  const myMember = members.find(m => m.user_id === currentUser.id);
  const nick = myMember?.nickname || "Membro";
  const color = myMember?.color || "var(--accent)";
  const score = anime[`nota${nick}`] || "";
  const hasScore = score !== "";
  
  const currentComment = anime.comentarios.split('\n')
    .find(c => c.startsWith(`${nick}:`))
    ?.replace(`${nick}:`, "").trim() || "";

  container.innerHTML = `
    <details class="anime-edit-details">
      <summary class="anime-edit-summary">
        <div>
          <h3>Seu registro</h3>
          <p>Editando como <strong style="color:${color}">${escapeHTML(nick)}</strong></p>
        </div>
        <span class="edit-expand-button">Editar</span>
      </summary>
      <div class="anime-edit-body">
        <label class="edit-field">
          <span>Nota</span>
          <input id="anime-edit-score" type="number" min="0" max="10" step="0.1" value="${score}" />
        </label>
        <label class="edit-field">
          <span>Comentário</span>
          <textarea id="anime-edit-comment" maxlength="600" placeholder="Escreva seu comentário...">${escapeHTML(currentComment)}</textarea>
        </label>
        <div class="anime-edit-actions">
          <button class="edit-button" type="button" data-save-anime-edit data-anime-id="${anime.mal_id}">${hasScore || currentComment ? "Salvar" : "Enviar"}</button>
          <span id="anime-edit-status" class="edit-status"></span>
        </div>
      </div>
    </details>
  `;
}

window.supabaseLogin = async () => {
  await supabase.auth.signInWithOAuth({ provider: 'google' });
};

document.addEventListener("click", async (e) => {
  const saveBtn = e.target.closest("[data-save-anime-edit]");
  if (!saveBtn || !currentUser) return;

  const animeId = saveBtn.dataset.animeId;
  const scoreEl = document.getElementById("anime-edit-score");
  const commentEl = document.getElementById("anime-edit-comment");
  const statusEl = document.getElementById("anime-edit-status");

  const rawScore = scoreEl?.value.trim();
  const score = rawScore === "" ? null : Number(rawScore);
  const comment = commentEl?.value.trim() || "";

  if (score !== null && (isNaN(score) || score < 0 || score > 10)) {
    if (statusEl) statusEl.textContent = "Nota inválida.";
    return;
  }

  saveBtn.disabled = true;
  if (statusEl) statusEl.textContent = "Salvando...";

  try {
    const groupId = getGroupId();
    await supabase.from('votes').upsert({ group_id: groupId, mal_id: parseInt(animeId), user_id: currentUser.id, score, comment }, { onConflict: 'group_id, mal_id, user_id' });

    if (statusEl) statusEl.textContent = "Salvo!";
    setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 2000);

    invalidateCache();
    const data = await loadData();
    allAnimes = data.animes;
    members = data.members;
    applyFilters(); // Re-filtra e re-renderiza
    refreshModal();
  } catch (err) {
    if (statusEl) statusEl.textContent = "Erro ao salvar.";
    saveBtn.disabled = false;
  }
});

// ── Link management ───────────────────────────────────────────────────────────

function renderLinks(links) {
  const list = Object.entries(links || {}).filter(([k, v]) => v && k !== 'dublado');
  if (list.length === 0) return '<p class="empty-msg">Nenhum link disponível.</p>';
  
  return list.map(([name, url]) => `
    <a href="${url}" target="_blank" class="media-link">
      <span>${escapeHTML(name)}</span>
      <span class="link-icon">↗</span>
    </a>
  `).join("");
}

initTable();
