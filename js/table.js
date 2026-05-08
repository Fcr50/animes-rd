// js/table.js
import { supabase } from './supabase-client.js';
import { getGroupId, normalizeText, escapeHTML, stripEmoji, shortText } from './utils.js';
import { loadData, notaColor, formatNota, getPersonColor, invalidateCache } from './data.js';

let allAnimes = [];
let filtered = [];
let sortCol = "notaSort";
let sortDir = -1;
let currentModalIndex = null;
let currentUser = null;
let members = [];
let imageQueueRunning = false;

const imageCache = new Map();
const queuedImageMalIds = new Set();

const FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E%3Crect width='56' height='56' rx='8' fill='%2318171d'/%3E%3Cpath d='M16 36h24M18 18h20v20H18z' stroke='%237b7165' stroke-width='2' fill='none'/%3E%3Ccircle cx='23' cy='24' r='3' fill='%237b7165'/%3E%3Cpath d='M19 35l8-8 5 5 3-3 4 6' stroke='%237b7165' stroke-width='2' fill='none'/%3E%3C/svg%3E";

const IMAGE_OVERRIDES = {
  49730: "https://myanimelist.net/images/anime/1787/140239l.webp",
};

// ── Image cache ──────────────────────────────────────────────────────────────

function getCachedImage(malId) {
  if (!malId) return null;
  if (IMAGE_OVERRIDES[malId]) return IMAGE_OVERRIDES[malId];
  if (imageCache.has(malId)) return imageCache.get(malId);
  const cached = localStorage.getItem(`jikan-image-v2-${malId}`);
  if (cached) { imageCache.set(malId, cached); return cached; }
  return null;
}

function setCachedImage(malId, imageUrl) {
  if (!malId || !imageUrl) return;
  imageCache.set(malId, imageUrl);
  try { localStorage.setItem(`jikan-image-v2-${malId}`, imageUrl); } catch {}
}

function updateRenderedImages(malId, imageUrl) {
  document.querySelectorAll(`img[data-mal-id="${CSS.escape(String(malId))}"]`).forEach(img => {
    img.src = imageUrl;
    img.classList.add("loaded");
  });
}

function queueAnimeImage(malId) {
  if (!malId || getCachedImage(malId) || queuedImageMalIds.has(malId)) return;
  queuedImageMalIds.add(malId);
  runImageQueue();
}

async function runImageQueue() {
  if (imageQueueRunning) return;
  imageQueueRunning = true;
  while (queuedImageMalIds.size) {
    const [malId] = queuedImageMalIds;
    queuedImageMalIds.delete(malId);
    try {
      const res = await fetch(`https://api.jikan.moe/v4/anime/${encodeURIComponent(malId)}`);
      if (res.ok) {
        const payload = await res.json();
        const imageUrl =
          payload?.data?.images?.webp?.image_url ||
          payload?.data?.images?.jpg?.image_url ||
          payload?.data?.images?.webp?.small_image_url ||
          payload?.data?.images?.jpg?.small_image_url;
        if (imageUrl) { setCachedImage(malId, imageUrl); updateRenderedImages(malId, imageUrl); }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 450));
  }
  imageQueueRunning = false;
}

// ── Anime identity (image + name) ────────────────────────────────────────────

function renderAnimeIdentity(anime) {
  const malId = anime.mal_id;
  const imageUrl = getCachedImage(malId) || FALLBACK_IMAGE;
  const imgAttrs = malId ? `data-mal-id="${escapeHTML(String(malId))}" data-anime-img` : "";
  return `
    <span class="anime-identity">
      <img class="anime-img" src="${escapeHTML(imageUrl)}" alt="" loading="lazy" ${imgAttrs} />
      <span class="anime-name">${escapeHTML(anime.name)}</span>
      ${anime.pt_dub ? `<span class="dub-badge" title="Disponível dublado em Português">🇧🇷 DUB</span>` : ""}
    </span>
  `;
}

// ── Init ─────────────────────────────────────────────────────────────────────

export async function initTable() {
  const data = await loadData();
  allAnimes = data.animes;
  members = data.members;
  filtered = [...allAnimes];

  sortData();
  renderFilters();
  renderTable();
  renderModal();

  supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    refreshModal();
  });

  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;
}

// ── Filters ──────────────────────────────────────────────────────────────────

function renderFilters() {
  const wrap = document.getElementById("filters");
  if (!wrap) return;

  const genreMap = new Map();
  allAnimes.forEach(a => {
    (a.generos || []).forEach(g => {
      const clean = stripEmoji(g);
      if (!genreMap.has(clean) || g.length > genreMap.get(clean).length)
        genreMap.set(clean, g);
    });
  });
  const genres = [...genreMap.values()].sort((a, b) => a.localeCompare(b));

  wrap.innerHTML = `
    <input type="text" id="search" placeholder="🔍  Buscar anime..." />
    <select id="filter-genre">
      <option value="">Todos os gêneros</option>
      ${genres.map(g => `<option value="${g}">${g}</option>`).join("")}
    </select>
    <select id="filter-person">
      <option value="">Todos os usuários</option>
      ${members.map(m => `<option value="${m.nickname}">${m.nickname}</option>`).join("")}
    </select>
    <select id="filter-status">
      <option value="">Status (Qualquer)</option>
      <option value="watched">Que eu assisti</option>
      <option value="not-watched">Que eu NÃO assisti</option>
    </select>
    <select id="filter-votes">
      <option value="">Qtd. votos</option>
      <option value="5">5 votos</option>
      <option value="4">4 votos</option>
      <option value="3">3 votos</option>
      <option value="2">2 votos</option>
      <option value="1">1 voto</option>
    </select>
  `;

  wrap.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", applyFilters);
  });
}

function applyFilters() {
  const search = document.getElementById("search")?.value.toLowerCase() || "";
  const genreSelected = document.getElementById("filter-genre")?.value || "";
  const person = document.getElementById("filter-person")?.value || "";
  const status = document.getElementById("filter-status")?.value || "";
  const votes = document.getElementById("filter-votes")?.value || "";

  const cleanedGenre = genreSelected ? stripEmoji(genreSelected) : "";

  filtered = allAnimes.filter(a => {
    if (search && !a.name.toLowerCase().includes(search)) return false;

    if (cleanedGenre) {
      const hasGenre = (a.generos || []).some(g => stripEmoji(g) === cleanedGenre);
      if (!hasGenre) return false;
    }

    if (person && !a.quemAssistiu.includes(person)) return false;

    if (status && currentUser) {
      const myMember = members.find(m => m.user_id === currentUser.id);
      if (myMember) {
        const watched = a.quemAssistiu.includes(myMember.nickname);
        if (status === "watched" && !watched) return false;
        if (status === "not-watched" && watched) return false;
      }
    }

    if (votes && String(a.qtdVotos) !== votes) return false;

    return true;
  });

  sortData();
  renderTable();
}

// ── Sort ─────────────────────────────────────────────────────────────────────

function sortData() {
  filtered.sort((a, b) => {
    let va = a[sortCol];
    let vb = b[sortCol];
    if (va == null) va = -Infinity;
    if (vb == null) vb = -Infinity;
    if (typeof va === "string") return sortDir * va.localeCompare(vb);
    return sortDir * (va - vb);
  });
}

// ── Table ────────────────────────────────────────────────────────────────────

function renderTable() {
  const tbody = document.getElementById("anime-tbody");
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--faint)">Nenhum anime encontrado</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const nota = a.nota !== null ? Number(a.nota).toFixed(2) : "—";
    const notaCls = notaColor(a.nota);
    const genres = (a.generos || [])
      .slice(0, 2)
      .map(g => `<span class="badge badge-genre">${g}</span>`)
      .join("");
    const moreGenres = (a.generos || []).length > 2
      ? `<span class="badge badge-genre">+${a.generos.length - 2}</span>`
      : "";
    const viewers = a.quemAssistiu
      .map(p => {
        const color = getPersonColor(p);
        return `<span class="badge" style="background:${color}22;color:${color}">${p}</span>`;
      })
      .join("");
    const contr = a.controversia !== null ? Number(a.controversia).toFixed(1) : "—";
    const contrCls = a.controversia > 1.5 ? "controversia-hot" : "controversia";

    return `
      <tr data-idx="${allAnimes.indexOf(a)}" onclick="window.openModal(${allAnimes.indexOf(a)})">
        <td>${renderAnimeIdentity(a)}</td>
        <td>${genres}${moreGenres}</td>
        <td>${viewers}</td>
        <td style="text-align:center"><span class="nota ${notaCls}">${nota}</span></td>
        <td style="text-align:center">${a.qtdVotos ?? "—"}</td>
        <td style="text-align:center"><span class="${contrCls}">${Number(contr) > 0 ? "🌶️ " + contr : contr}</span></td>
      </tr>
    `;
  }).join("");

  filtered.forEach(anime => queueAnimeImage(anime.mal_id));
}

// ── Modal ────────────────────────────────────────────────────────────────────

function renderModal() {
  if (document.getElementById("modal-overlay")) return;
  const div = document.createElement("div");
  div.id = "modal-overlay";
  div.className = "modal-overlay";
  div.innerHTML = `
    <div class="modal" id="modal-content">
      <div class="modal-header">
        <h2 class="modal-title" id="modal-title"></h2>
        <button class="modal-close" onclick="window.closeModal()">✕</button>
      </div>
      <div id="modal-genres" class="modal-genres"></div>
      <div class="notes-grid" id="modal-notes"></div>
      <div id="modal-meta" class="modal-meta"></div>
      <div id="modal-links"></div>
      <div id="modal-comment"></div>
      <div id="modal-edit"></div>
    </div>
  `;
  div.addEventListener("click", e => { if (e.target === div) window.closeModal(); });
  document.body.appendChild(div);
}

window.openModal = function(idx) {
  const a = allAnimes[idx];
  if (!a) return;
  currentModalIndex = idx;

  document.getElementById("modal-title").textContent = a.name;

  document.getElementById("modal-genres").innerHTML = (a.generos || [])
    .map(g => `<span class="badge badge-genre">${g}</span>`)
    .join(" ");

  document.getElementById("modal-notes").innerHTML = members.map(m => {
    const nota = a[`nota${m.nickname}`];
    const color = getPersonColor(m.nickname);
    return `
      <div class="note-box" style="--note-color:${color}">
        <div class="person" style="color:${color}">${m.nickname}</div>
        <div class="score ${nota === null ? "empty" : notaColor(nota)}">
          ${nota !== null ? Number(nota).toFixed(1) : "—"}
        </div>
      </div>
    `;
  }).join("");

  const metaItems = [];
  if (a.nota !== null) metaItems.push(`Média: <span>${Number(a.nota).toFixed(2)}</span>`);
  if (a.controversia !== null) {
    const hot = a.controversia > 1.5 ? "🌶️ " : "";
    metaItems.push(`Controvérsia: <span>${hot}${Number(a.controversia).toFixed(1)}</span>`);
  }
  if (a.qtdVotos != null) metaItems.push(`Votos: <span>${a.qtdVotos}</span>`);
  document.getElementById("modal-meta").innerHTML = metaItems
    .map(m => `<span class="meta-item">${m}</span>`)
    .join("");

  // Links
  renderModalLinks(a);
  document.getElementById("modal-links").dataset.animeId = a.id;

  // Comentários
  const comments = (a.comentarios || "").split("\n").filter(Boolean);
  document.getElementById("modal-comment").innerHTML = comments.length ? `
    <section class="modal-comments"><h3>Comentários</h3>
      <div class="comment-list">
        ${comments.map(line => {
          const [nick, ...rest] = line.split(": ");
          const color = getPersonColor(nick.trim());
          return `<article class="comment-item">
            <strong style="color:${color}">${escapeHTML(nick.trim())}</strong>
            <p>${escapeHTML(rest.join(": ").trim())}</p>
          </article>`;
        }).join("")}
      </div>
    </section>
  ` : "";

  // Edição de nota
  document.getElementById("modal-edit").innerHTML = renderEditPanel(a);

  document.getElementById("modal-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
};

function renderEditPanel(anime) {
  if (!currentUser) {
    return `
      <section class="anime-edit-panel">
        <h3>Seu registro</h3>
        <p>Faça login para editar sua nota e comentário.</p>
        <button class="edit-button" type="button" onclick="window.supabaseLogin()">Login com Google</button>
      </section>
    `;
  }

  const myMember = members.find(m => m.user_id === currentUser.id);
  if (!myMember) return "";

  const nick = myMember.nickname;
  const color = getPersonColor(nick);
  const currentScore = anime[`nota${nick}`];
  const hasScore = currentScore !== null && currentScore !== undefined;
  const score = hasScore ? Number(currentScore).toFixed(1) : "5.0";
  const currentComment = (() => {
    const lines = (anime.comentarios || "").split("\n");
    const line = lines.find(l => l.startsWith(`${nick}: `));
    return line ? line.slice(nick.length + 2) : "";
  })();

  return `
    <details class="anime-edit-panel anime-edit-collapsible">
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
          <button class="edit-button" type="button" data-save-anime-edit data-anime-id="${anime.id}">${hasScore || currentComment ? "Salvar alterações" : "Enviar nota"}</button>
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
    if (statusEl) statusEl.textContent = "Use uma nota entre 0 e 10.";
    return;
  }

  saveBtn.disabled = true;
  if (statusEl) statusEl.textContent = "Salvando...";

  try {
    const { error } = await supabase
      .from('votes')
      .upsert({ anime_id: animeId, user_id: currentUser.id, score, comment }, { onConflict: 'anime_id,user_id' });

    if (error) throw error;
    if (statusEl) statusEl.textContent = "Salvo!";
    setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 2000);

    // Invalida cache e recarrega dados
    invalidateCache();
    const data = await loadData();
    allAnimes = data.animes;
    members = data.members;
    filtered = [...allAnimes];
    sortData();
    renderTable();
    if (currentModalIndex !== null) window.openModal(currentModalIndex);
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = "Erro ao salvar.";
    saveBtn.disabled = false;
  }
});

// ── Link management ───────────────────────────────────────────────────────────

function renderModalLinks(anime) {
  const canEdit = !!currentUser;
  const links = anime.links || {};
  const entries = Object.entries(links).filter(([, url]) => url);
  const malLink = anime.mal_id
    ? `<a class="modal-link-chip modal-link-mal" href="https://myanimelist.net/anime/${encodeURIComponent(anime.mal_id)}" target="_blank" rel="noopener">MyAnimeList</a>`
    : "";
  const openingSearch = `<a class="modal-link-chip modal-link-opening" href="https://www.youtube.com/results?search_query=${encodeURIComponent(anime.name + ' anime opening')}" target="_blank" rel="noopener">Buscar opening</a>`;

  const linkChips = entries.map(([name, url], idx) => {
    const editDelete = canEdit ? `
      <div class="modal-link-chip-actions">
        <button class="modal-link-chip-action-btn" onclick="window.startEditLink('${escapeHTML(anime.id)}','${escapeHTML(name)}')" title="Editar">✎</button>
        <button class="modal-link-chip-action-btn modal-link-delete-btn" onclick="window.deleteAnimeLink('${escapeHTML(anime.id)}','${escapeHTML(name)}')" title="Excluir">×</button>
      </div>` : "";
    return `<div class="modal-link-chip-wrap">
      <a class="modal-link-chip modal-link-custom" href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(name)}</a>
      ${editDelete}
    </div>`;
  }).join("");

  const addBtn = canEdit ? `<button class="modal-link-add-btn" onclick="window.toggleAddLinkForm('${escapeHTML(anime.id)}')" title="Adicionar link">+</button>` : "";

  document.getElementById("modal-links").innerHTML = `
    <section class="modal-links">
      <h3>Links úteis</h3>
      <div class="modal-link-list">
        ${malLink}
        ${linkChips || (!canEdit ? openingSearch : "")}
        ${addBtn}
      </div>
      <div id="add-link-form-${escapeHTML(anime.id)}" class="add-link-form" hidden>
        <input id="add-link-name-${escapeHTML(anime.id)}" class="add-link-input" type="text" placeholder="Nome do link" maxlength="60" />
        <input id="add-link-url-${escapeHTML(anime.id)}" class="add-link-input" type="url" placeholder="https://..." maxlength="500" />
        <div class="add-link-actions">
          <button class="edit-button" onclick="window.saveCustomLink('${escapeHTML(anime.id)}')">Salvar</button>
          <button class="edit-link-button" onclick="window.toggleAddLinkForm('${escapeHTML(anime.id)}')">Cancelar</button>
          <span id="add-link-status-${escapeHTML(anime.id)}" class="edit-status"></span>
        </div>
      </div>
      <div id="edit-link-form-${escapeHTML(anime.id)}" class="add-link-form" hidden>
        <input id="edit-link-name-${escapeHTML(anime.id)}" class="add-link-input" type="text" placeholder="Nome do link" maxlength="60" />
        <input id="edit-link-url-${escapeHTML(anime.id)}" class="add-link-input" type="url" placeholder="https://..." maxlength="500" />
        <div class="add-link-actions">
          <button class="edit-button" onclick="window.saveEditLink('${escapeHTML(anime.id)}')">Salvar</button>
          <button class="edit-link-button" onclick="window.cancelEditLink('${escapeHTML(anime.id)}')">Cancelar</button>
          <span id="edit-link-status-${escapeHTML(anime.id)}" class="edit-status"></span>
        </div>
      </div>
    </section>
  `;
}

async function updateAnimeLinks(animeId, newLinks) {
  const { data: updated, error, count } = await supabase
    .from('animes')
    .update({ links: newLinks })
    .eq('id', animeId)
    .select('id, links');

  if (error) {
    console.error('[updateAnimeLinks] Supabase error:', error);
    throw new Error(error.message);
  }

  if (!updated || updated.length === 0) {
    console.warn('[updateAnimeLinks] 0 rows updated — possível falta de permissão (RLS) ou coluna links inexistente.');
    throw new Error('Nenhuma linha atualizada. Verifique permissões ou schema.');
  }

  console.log('[updateAnimeLinks] Salvo com sucesso:', updated[0]);

  // Atualiza estado local imediatamente
  const update = a => a.id === animeId ? { ...a, links: newLinks } : a;
  allAnimes = allAnimes.map(update);
  filtered = filtered.map(update);

  renderTable();
  if (currentModalIndex !== null) window.openModal(currentModalIndex);
}

window.toggleAddLinkForm = (animeId) => {
  const form = document.getElementById(`add-link-form-${animeId}`);
  if (!form) return;
  form.hidden = !form.hidden;
  if (!form.hidden) document.getElementById(`add-link-name-${animeId}`)?.focus();
};

window.saveCustomLink = async (animeId) => {
  const nameEl = document.getElementById(`add-link-name-${animeId}`);
  const urlEl = document.getElementById(`add-link-url-${animeId}`);
  const statusEl = document.getElementById(`add-link-status-${animeId}`);
  const name = nameEl?.value.trim();
  const url = urlEl?.value.trim();
  if (!name || !url) { if (statusEl) statusEl.textContent = "Preencha nome e URL."; return; }
  try { new URL(url); } catch { if (statusEl) statusEl.textContent = "URL inválida."; return; }
  try {
    const anime = allAnimes.find(a => a.id === animeId);
    const newLinks = { ...(anime?.links || {}), [name]: url };
    await updateAnimeLinks(animeId, newLinks);
  } catch { if (statusEl) statusEl.textContent = "Erro ao salvar."; }
};

let _editingLinkName = null;
window.startEditLink = (animeId, linkName) => {
  _editingLinkName = linkName;
  const anime = allAnimes.find(a => a.id === animeId);
  const url = anime?.links?.[linkName] || "";
  document.getElementById(`add-link-form-${animeId}`).hidden = true;
  const form = document.getElementById(`edit-link-form-${animeId}`);
  const nameEl = document.getElementById(`edit-link-name-${animeId}`);
  const urlEl = document.getElementById(`edit-link-url-${animeId}`);
  if (nameEl) nameEl.value = linkName;
  if (urlEl) urlEl.value = url;
  if (form) { form.hidden = false; nameEl?.focus(); }
};

window.cancelEditLink = (animeId) => {
  _editingLinkName = null;
  const form = document.getElementById(`edit-link-form-${animeId}`);
  if (form) form.hidden = true;
};

window.saveEditLink = async (animeId) => {
  const nameEl = document.getElementById(`edit-link-name-${animeId}`);
  const urlEl = document.getElementById(`edit-link-url-${animeId}`);
  const statusEl = document.getElementById(`edit-link-status-${animeId}`);
  const newName = nameEl?.value.trim();
  const newUrl = urlEl?.value.trim();
  if (!newName || !newUrl) { if (statusEl) statusEl.textContent = "Preencha nome e URL."; return; }
  try { new URL(newUrl); } catch { if (statusEl) statusEl.textContent = "URL inválida."; return; }
  try {
    const anime = allAnimes.find(a => a.id === animeId);
    const newLinks = { ...(anime?.links || {}) };
    if (_editingLinkName && _editingLinkName !== newName) delete newLinks[_editingLinkName];
    newLinks[newName] = newUrl;
    _editingLinkName = null;
    await updateAnimeLinks(animeId, newLinks);
  } catch { if (statusEl) statusEl.textContent = "Erro ao salvar."; }
};

window.deleteAnimeLink = async (animeId, linkName) => {
  if (!confirm(`Remover link "${linkName}"?`)) return;
  try {
    const anime = allAnimes.find(a => a.id === animeId);
    const newLinks = { ...(anime?.links || {}) };
    delete newLinks[linkName];
    await updateAnimeLinks(animeId, newLinks);
  } catch { alert("Erro ao remover link."); }
};

window.closeModal = function() {
  document.getElementById("modal-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
  currentModalIndex = null;
};

function refreshModal() {
  if (currentModalIndex !== null) window.openModal(currentModalIndex);
}

// ── Column sort ──────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("thead th[data-col]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortCol === col) { sortDir *= -1; }
      else { sortCol = col; sortDir = -1; }
      document.querySelectorAll("thead th").forEach(h => h.classList.remove("sorted"));
      th.classList.add("sorted");
      sortData();
      renderTable();
    });
  });
});
