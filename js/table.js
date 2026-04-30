// js/table.js?v=pokemon-image-1 — tabela com filtros, ordenação e modal

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import {
  formatNota,
  notaColor,
  PEOPLE,
  PERSON_COLORS,
  PERSON_LIGHTS,
} from "./data.js?v=pokemon-image-1";
import { escapeHTML, normalizeText, stripEmoji } from "./utils.js";

let allAnimes = [];
let filtered = [];
let sortCol = "notaSort";
let sortDir = -1;
let currentModalIndex = null;
let currentUser = null;
let imageQueueRunning = false;

const imageCache = new Map();
const queuedImageMalIds = new Set();

const isFirebaseConfigured = firebaseConfig.apiKey !== "SUA_API_KEY";
const app = isFirebaseConfigured ? getApps()[0] || initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

const NOTE_FIELDS = {
  Rafael: "notaRafael",
  Fernando: "notaFernando",
  Dudu: "notaDudu",
  Hacksuya: "notaHacksuya",
};

const FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E%3Crect width='56' height='56' rx='8' fill='%2318171d'/%3E%3Cpath d='M16 36h24M18 18h20v20H18z' stroke='%237b7165' stroke-width='2' fill='none'/%3E%3Ccircle cx='23' cy='24' r='3' fill='%237b7165'/%3E%3Cpath d='M19 35l8-8 5 5 3-3 4 6' stroke='%237b7165' stroke-width='2' fill='none'/%3E%3C/svg%3E";

const IMAGE_OVERRIDES = {
  49730: "https://myanimelist.net/images/anime/1787/140239l.webp",
};

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
      const person = PEOPLE.find((p) => normalizeText(p) === normalizeText(match[1]));
      return { person, text: match[2].trim() };
    })
    .filter((comment) => comment.text);
}

function getPersonComment(anime, person) {
  return commentsForAnime(anime).find((comment) => comment.person === person)?.text || "";
}

function setPersonComment(anime, person, text) {
  const trimmed = text.trim();
  const comments = commentsForAnime(anime).filter((comment) => comment.person !== person);
  if (trimmed) comments.push({ person, text: trimmed });
  return comments;
}

function recalculateAnime(anime) {
  const notes = PEOPLE.map((person) => ({
    person,
    score: anime[NOTE_FIELDS[person]],
  })).filter(
    (item) => item.score !== null && item.score !== undefined && !Number.isNaN(Number(item.score)),
  );

  const scores = notes.map((item) => Number(item.score));
  const avg = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  const max = scores.length ? Math.max(...scores) : null;
  const min = scores.length ? Math.min(...scores) : null;

  return {
    ...anime,
    quemAssistiu: notes.map((item) => item.person),
    qtdVotos: notes.length,
    nota: avg === null ? null : avg.toFixed(2),
    notaSort: avg === null ? 0 : Number(avg.toFixed(2)),
    controversia: scores.length > 1 ? Number((max - min).toFixed(1)) : 0,
    maisDeUmVoto: notes.length > 1 ? "sim" : "nao",
  };
}

function getStoredPersonName(uid) {
  return localStorage.getItem(`user-${uid}-personName`);
}

function setStoredPersonName(uid, personName) {
  localStorage.setItem(`user-${uid}-personName`, personName);
}

function getCachedImage(malId) {
  if (!malId) return null;
  if (IMAGE_OVERRIDES[malId]) return IMAGE_OVERRIDES[malId];
  if (imageCache.has(malId)) return imageCache.get(malId);

  const cached = localStorage.getItem(`jikan-image-${malId}`);
  if (cached) {
    imageCache.set(malId, cached);
    return cached;
  }

  return null;
}

function setCachedImage(malId, imageUrl) {
  if (!malId || !imageUrl) return;
  imageCache.set(malId, imageUrl);
  try {
    localStorage.setItem(`jikan-image-${malId}`, imageUrl);
  } catch {
    // Cache is best-effort; images still work for this render.
  }
}

function renderAnimeIdentity(anime) {
  const malId = anime.malId;
  const imageUrl = getCachedImage(malId) || FALLBACK_IMAGE;
  const imgAttrs = malId ? `data-mal-id="${escapeHTML(malId)}" data-anime-img` : "";

  return `
    <span class="anime-identity">
      <img class="anime-img" src="${escapeHTML(imageUrl)}" alt="" loading="lazy" ${imgAttrs} />
      <span class="anime-name">${escapeHTML(anime.nome)}</span>
    </span>
  `;
}

function updateRenderedImages(malId, imageUrl) {
  document.querySelectorAll(`img[data-mal-id="${CSS.escape(String(malId))}"]`).forEach((img) => {
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
          payload?.data?.images?.webp?.small_image_url ||
          payload?.data?.images?.jpg?.small_image_url ||
          payload?.data?.images?.webp?.image_url ||
          payload?.data?.images?.jpg?.image_url;
        if (imageUrl) {
          setCachedImage(malId, imageUrl);
          updateRenderedImages(malId, imageUrl);
        }
      }
    } catch (error) {
      console.warn("Falha ao buscar imagem na Jikan", malId, error);
    }

    await new Promise((resolve) => setTimeout(resolve, 450));
  }

  imageQueueRunning = false;
}

export function initTable(animes) {
  // 1. Cria um mapa mestre de Gênero Limpo -> Gênero com Emoji
  const prettyMap = new Map();

  animes.forEach((a) => {
    (a.generos || []).forEach((g) => {
      const cleaned = stripEmoji(g);
      // Se a versão atual tem emoji (é maior que a versão limpa), guarda no mapa
      if (g.length > cleaned.length) {
        if (!prettyMap.has(cleaned) || g.length > prettyMap.get(cleaned).length) {
          prettyMap.set(cleaned, g);
        }
      }
    });
  });

  // 2. Padroniza todos os animes na memória para usar a versão com emoji
  allAnimes = animes.map((a) => ({
    ...a,
    generos: (a.generos || []).map((g) => prettyMap.get(stripEmoji(g)) || g),
  }));

  filtered = [...allAnimes];
  renderFilters();
  renderTable();
  renderModal();
  openAnimeFromUrl();
}

function openAnimeFromUrl() {
  const animeId = new URLSearchParams(window.location.search).get("anime");
  if (!animeId) return;
  const index = allAnimes.findIndex((anime) => String(anime.id) === animeId);
  if (index >= 0) window.openModal(index);
}

function renderFilters() {
  const wrap = document.getElementById("filters");
  if (!wrap) return;

  // Coleta gêneros únicos e resolve duplicatas (com/sem emoji)
  const genreMap = new Map(); // limpo -> original (preferencialmente com emoji)

  allAnimes.forEach((a) => {
    (a.generos || []).forEach((g) => {
      const clean = stripEmoji(g);
      if (!genreMap.has(clean) || g.length > genreMap.get(clean).length) {
        genreMap.set(clean, g);
      }
    });
  });

  const genres = [...genreMap.values()].sort((a, b) => a.localeCompare(b));

  wrap.innerHTML = `
    <input type="text" id="search" placeholder="🔍  Buscar anime..." />
    <select id="filter-genre">
      <option value="">Todos os gêneros</option>
      ${genres.map((g) => `<option value="${g}">${g}</option>`).join("")}
    </select>
    <select id="filter-person">
      <option value="">Todos os usuários</option>
      ${PEOPLE.map((p) => `<option value="${p}">${p}</option>`).join("")}
    </select>
    <select id="filter-status">
      <option value="">Status (Qualquer)</option>
      <option value="watched">Que eu assisti</option>
      <option value="not-watched">Que eu NÃO assisti</option>
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
  const genreSelected = document.getElementById("filter-genre")?.value || "";
  const person = document.getElementById("filter-person")?.value || "";
  const status = document.getElementById("filter-status")?.value || "";
  const votes = document.getElementById("filter-votes")?.value || "";

  // Função auxiliar para limpar emoji para comparação
  const cleanedSelectedGenre = genreSelected ? stripEmoji(genreSelected) : "";

  filtered = allAnimes.filter((a) => {
    if (search && !a.nome.toLowerCase().includes(search)) return false;

    if (cleanedSelectedGenre) {
      const hasGenre = (a.generos || []).some((g) => stripEmoji(g) === cleanedSelectedGenre);
      if (!hasGenre) return false;
    }

    if (person && !a.quemAssistiu.includes(person)) return false;

    // Lógica do filtro de Status (Assistido/Não assistido por MIM)
    if (status) {
      if (!currentUser || !currentUser.personName) {
        // Se o usuário não está logado, ignoramos o filtro de status mas poderíamos avisar
        return true;
      }
      const userWatched = a.quemAssistiu.includes(currentUser.personName);
      if (status === "watched" && !userWatched) return false;
      if (status === "not-watched" && userWatched) return false;
    }

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
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--faint)">Nenhum anime encontrado</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((a, i) => {
      const nota = a.nota !== null ? Number(a.nota).toFixed(2) : "—";
      const notaCls = notaColor(a.nota);
      const genres = a.generos
        .slice(0, 2)
        .map((g) => `<span class="badge badge-genre">${g}</span>`)
        .join("");
      const moreGenres =
        a.generos.length > 2
          ? `<span class="badge badge-genre">+${a.generos.length - 2}</span>`
          : "";
      const viewers = a.quemAssistiu
        .map((p) => `<span class="badge badge-${p.toLowerCase()}">${p}</span>`)
        .join("");
      const contr = a.controversia !== null ? Number(a.controversia).toFixed(1) : "—";
      const contrCls = a.controversia > 1.5 ? "controversia-hot" : "controversia";

      return `
      <tr data-idx="${i}" onclick="openModal(${allAnimes.indexOf(a)})">
        <td>${renderAnimeIdentity(a)}</td>
        <td>${genres}${moreGenres}</td>
        <td>${viewers}</td>
        <td><span class="nota ${notaCls}">${nota}</span></td>
        <td>${a.qtdVotos ?? "—"}</td>
        <td><span class="${contrCls}">${contr > 0 ? "🌶️ " + contr : contr}</span></td>
      </tr>
    `;
    })
    .join("");

  filtered.forEach((anime) => queueAnimeImage(anime.malId));
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
      <div id="modal-links"></div>
      <div id="modal-comment"></div>
      <div id="modal-edit"></div>
    </div>
  `;
  div.addEventListener("click", (e) => {
    if (e.target === div) closeModal();
  });
  document.body.appendChild(div);
}

window.openModal = function (idx) {
  const a = allAnimes[idx];
  if (!a) return;
  currentModalIndex = idx;

  document.getElementById("modal-title").textContent = a.nome;

  document.getElementById("modal-genres").innerHTML = a.generos
    .map((g) => `<span class="badge badge-genre">${g}</span>`)
    .join(" ");

  const notas = [
    { person: "Rafael", nota: a.notaRafael, color: PERSON_LIGHTS.Rafael },
    { person: "Fernando", nota: a.notaFernando, color: PERSON_LIGHTS.Fernando },
    { person: "Dudu", nota: a.notaDudu, color: PERSON_LIGHTS.Dudu },
    { person: "Hacksuya", nota: a.notaHacksuya, color: PERSON_LIGHTS.Hacksuya },
  ];

  document.getElementById("modal-notes").innerHTML = notas
    .map(
      (n) => `
    <div class="note-box" style="--note-color:${n.color}">
      <div class="person" style="color:${n.color}">${n.person}</div>
      <div class="score ${n.nota === null ? "empty" : notaColor(n.nota)}">
        ${n.nota !== null ? Number(n.nota).toFixed(1) : "—"}
      </div>
    </div>
  `,
    )
    .join("");

  const metaItems = [];
  if (a.nota !== null) metaItems.push(`Média: <span>${Number(a.nota).toFixed(2)}</span>`);
  if (a.controversia !== null) {
    const hot = a.controversia > 1.5 ? "🌶️ " : "";
    metaItems.push(`Controvérsia: <span>${hot}${Number(a.controversia).toFixed(1)}</span>`);
  }
  if (a.qtdVotos !== null) metaItems.push(`Votos: <span>${a.qtdVotos}</span>`);

  document.getElementById("modal-meta").innerHTML = metaItems
    .map((m) => `<span class="meta-item">${m}</span>`)
    .join("");

  document.getElementById("modal-links").innerHTML = renderAnimeLinks(a);

  const commentEl = document.getElementById("modal-comment");
  commentEl.innerHTML = renderComments(a);

  document.getElementById("modal-edit").innerHTML = renderEditForm(a);

  document.getElementById("modal-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
};

function renderAnimeLinks(anime) {
  const links = [];
  if (anime.malId) {
    links.push({
      label: "MyAnimeList",
      href: `https://myanimelist.net/anime/${encodeURIComponent(anime.malId)}`,
      kind: "mal",
    });
  }

  const openingLinks = Array.isArray(anime.files)
    ? anime.files
        .filter((file) => file?.url && /opening|op\b/i.test(file.name || ""))
        .slice(0, 3)
        .map((file, index) => ({
          label: file.name || `Opening ${index + 1}`,
          href: file.url,
          kind: "opening",
        }))
    : [];

  if (openingLinks.length) {
    links.push(...openingLinks);
  } else {
    links.push({
      label: "Buscar openings",
      href: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${anime.nome} anime opening`)}`,
      kind: "opening",
    });
  }

  const canEdit = !!currentUser?.personName;
  const id = escapeHTML(anime.id);

  return `
    <section class="modal-links">
      <h3>Links úteis</h3>
      <div class="modal-link-list">
        ${links
          .map(
            (link) => `
          <a class="modal-link-chip modal-link-${link.kind}" href="${escapeHTML(link.href)}" target="_blank" rel="noopener noreferrer">
            ${escapeHTML(link.label)}
          </a>
        `,
          )
          .join("")}
        ${canEdit ? `<button class="modal-link-add-btn" onclick="toggleAddLinkForm('${id}')" title="Adicionar link">+</button>` : ""}
      </div>
      ${canEdit ? `
      <div id="add-link-form-${id}" class="add-link-form" hidden>
        <input id="add-link-name-${id}" class="add-link-input" type="text" placeholder="Nome do link" maxlength="60" />
        <input id="add-link-url-${id}" class="add-link-input" type="url" placeholder="https://..." maxlength="500" />
        <div class="add-link-actions">
          <button class="edit-button" id="add-link-save-${id}" onclick="saveCustomLink('${id}')">Salvar</button>
          <button class="edit-link-button" type="button" onclick="toggleAddLinkForm('${id}')">Cancelar</button>
          <span id="add-link-status-${id}" class="edit-status"></span>
        </div>
      </div>` : ""}
    </section>
  `;
}

window.toggleAddLinkForm = function (animeId) {
  const form = document.getElementById(`add-link-form-${animeId}`);
  if (!form) return;
  form.hidden = !form.hidden;
  if (!form.hidden) {
    document.getElementById(`add-link-name-${animeId}`)?.focus();
    document.getElementById(`add-link-status-${animeId}`).textContent = "";
  }
};

window.saveCustomLink = async function (animeId) {
  if (!db || !currentUser?.personName) return;

  const anime = allAnimes.find((a) => a.id === animeId);
  if (!anime) return;

  const nameInput = document.getElementById(`add-link-name-${animeId}`);
  const urlInput = document.getElementById(`add-link-url-${animeId}`);
  const statusEl = document.getElementById(`add-link-status-${animeId}`);
  const saveBtn = document.getElementById(`add-link-save-${animeId}`);

  const name = nameInput.value.trim();
  const url = urlInput.value.trim();

  if (!name || !url) {
    statusEl.textContent = "Preencha nome e URL.";
    return;
  }
  try {
    new URL(url);
  } catch {
    statusEl.textContent = "URL inválida.";
    return;
  }

  saveBtn.disabled = true;
  statusEl.textContent = "Salvando...";

  try {
    const docRef = doc(db, "animes", animeId);
    let updatedAnime = null;

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists()) throw new Error("Anime não encontrado.");

      const current = { ...anime, ...snap.data(), id: anime.id };
      const newFiles = [...(Array.isArray(current.files) ? current.files : []), { name, url }];
      updatedAnime = { ...current, files: newFiles };

      transaction.update(docRef, { files: newFiles, updatedAt: serverTimestamp() });
    });

    updateAnimeLocally(animeId, updatedAnime);
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Erro: ${error.message || error}`;
    saveBtn.disabled = false;
  }
};

function renderComments(anime) {
  const comments = commentsForAnime(anime);
  if (!comments.length) return "";

  return `
    <section class="modal-comments">
      <h3>Comentários</h3>
      <div class="comment-list">
        ${comments
          .map((comment) => {
            const person = comment.person || "Comentário";
            const color = PERSON_LIGHTS[person] || "var(--muted)";
            return `
            <article class="comment-item">
              <strong style="color:${color}">${escapeHTML(person)}</strong>
              <p>${escapeHTML(comment.text)}</p>
            </article>
          `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderAuthBox() {
  if (!isFirebaseConfigured) {
    return `<p class="edit-status">Firebase não configurado para edição.</p>`;
  }

  if (!currentUser) {
    return `
      <section class="anime-edit-panel">
        <h3>Editar sua nota</h3>
        <p>Faça login para editar apenas a sua nota e o seu comentário.</p>
        <button class="edit-button" type="button" data-login-action>Login com Google</button>
      </section>
    `;
  }

  if (!currentUser.personName) {
    return `
      <section class="anime-edit-panel">
        <h3>Editar sua nota</h3>
        <p>Associe sua conta a um dos membros antes de editar.</p>
        <button class="edit-button" type="button" data-select-person-action>Selecionar meu nome</button>
      </section>
    `;
  }

  return "";
}

function renderEditForm(anime) {
  const authBox = renderAuthBox();
  if (authBox) return authBox;

  const person = currentUser.personName;
  const field = NOTE_FIELDS[person];
  if (!field) return "";

  const currentScore = anime[field];
  const hasScore = currentScore !== null && currentScore !== undefined;
  const score = hasScore ? Number(currentScore).toFixed(1) : "5.0";
  const comment = getPersonComment(anime, person);
  const color = PERSON_LIGHTS[person] || "var(--accent)";

  return `
    <details class="anime-edit-panel anime-edit-collapsible">
      <summary class="anime-edit-summary">
        <div>
          <h3>Seu registro</h3>
          <p>Editando como <strong style="color:${color}">${escapeHTML(person)}</strong></p>
        </div>
        <span class="edit-expand-button">Editar</span>
      </summary>
      <div class="anime-edit-body">
        <div class="anime-edit-head">
          <span></span>
          <button class="edit-link-button" type="button" data-logout-action>Sair</button>
        </div>
        <label class="edit-field">
        <span>Nota</span>
        <input id="anime-edit-score" type="number" min="0" max="10" step="0.1" value="${score}" />
        </label>
        <label class="edit-field">
        <span>Comentário</span>
        <textarea id="anime-edit-comment" maxlength="600" placeholder="Escreva seu comentário...">${escapeHTML(comment)}</textarea>
        </label>
        <div class="anime-edit-actions">
        <button class="edit-button" type="button" data-save-anime-edit>${hasScore || comment ? "Salvar alterações" : "Enviar nota"}</button>
        <span id="anime-edit-status" class="edit-status"></span>
        </div>
      </div>
    </details>
  `;
}

function refreshOpenModal() {
  if (currentModalIndex !== null) window.openModal(currentModalIndex);
}

function showUserSelectionModal() {
  if (!currentUser) return;
  document.getElementById("user-selection-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "user-selection-overlay";
  overlay.className = "user-selection-overlay";
  overlay.innerHTML = `
    <div class="user-selection-modal">
      <h3>Quem é você?</h3>
      <p>Essa escolha define qual nota e comentário você pode editar.</p>
      <div class="person-select-list">
        ${PEOPLE.map(
          (person) => `
          <button type="button" data-person-name="${person}">
            <span style="background:${PERSON_COLORS[person]}"></span>
            ${person}
          </button>
        `,
        ).join("")}
      </div>
    </div>
  `;
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.remove();
    const button = event.target.closest("[data-person-name]");
    if (!button) return;
    const personName = button.dataset.personName;
    setStoredPersonName(currentUser.uid, personName);
    currentUser.personName = personName;
    overlay.remove();
    refreshOpenModal();
  });
  document.body.appendChild(overlay);
}

async function handleLogin() {
  if (!auth) return;
  await signInWithPopup(auth, new GoogleAuthProvider());
}

async function handleLogout() {
  if (!auth) return;
  await signOut(auth);
}

function updateAnimeLocally(id, nextAnime) {
  allAnimes = allAnimes.map((anime) => (anime.id === id ? nextAnime : anime));
  filtered = filtered.map((anime) => (anime.id === id ? nextAnime : anime));
  sortData();
  renderTable();
  currentModalIndex = allAnimes.findIndex((anime) => anime.id === id);
  refreshOpenModal();
}

async function saveAnimeEdit(anime) {
  if (!db || !currentUser?.personName) return;

  const scoreEl = document.getElementById("anime-edit-score");
  const commentEl = document.getElementById("anime-edit-comment");
  const statusEl = document.getElementById("anime-edit-status");
  const button = document.querySelector("[data-save-anime-edit]");
  const person = currentUser.personName;
  const noteField = NOTE_FIELDS[person];
  const rawScore = scoreEl.value.trim();
  const score = rawScore === "" ? null : Number(rawScore);
  const comment = commentEl.value.trim();

  if (score !== null && (Number.isNaN(score) || score < 0 || score > 10)) {
    statusEl.textContent = "Use uma nota entre 0 e 10.";
    return;
  }

  button.disabled = true;
  statusEl.textContent = "Salvando...";

  try {
    const docRef = doc(db, "animes", anime.id);
    let updatedAnime = null;

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists()) throw new Error("Anime não encontrado no Firebase.");

      const current = { ...anime, ...snap.data(), id: anime.id };
      current[noteField] = score;
      current.comments = setPersonComment(current, person, comment);
      current.comentarios = current.comments
        .map((item) => `${item.person}: ${item.text}`)
        .join("\n");
      updatedAnime = recalculateAnime(current);

      transaction.update(docRef, {
        [noteField]: score,
        comments: updatedAnime.comments,
        comentarios: updatedAnime.comentarios,
        quemAssistiu: updatedAnime.quemAssistiu,
        qtdVotos: updatedAnime.qtdVotos,
        nota: updatedAnime.nota,
        notaSort: updatedAnime.notaSort,
        controversia: updatedAnime.controversia,
        maisDeUmVoto: updatedAnime.maisDeUmVoto,
        updatedAt: serverTimestamp(),
      });
    });

    updateAnimeLocally(anime.id, updatedAnime);
  } catch (error) {
    console.error(error);
    statusEl.textContent = `Erro ao salvar: ${error.message || error}`;
  } finally {
    button.disabled = false;
  }
}

window.closeModal = function () {
  document.getElementById("modal-overlay")?.classList.remove("open");
  document.body.style.overflow = "";
  currentModalIndex = null;
};

document.addEventListener("click", async (event) => {
  const loginButton = event.target.closest("[data-login-action]");
  if (loginButton) {
    await handleLogin();
    return;
  }

  const selectButton = event.target.closest("[data-select-person-action]");
  if (selectButton) {
    showUserSelectionModal();
    return;
  }

  const logoutButton = event.target.closest("[data-logout-action]");
  if (logoutButton) {
    await handleLogout();
    return;
  }

  const saveButton = event.target.closest("[data-save-anime-edit]");
  if (saveButton && currentModalIndex !== null) {
    await saveAnimeEdit(allAnimes[currentModalIndex]);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.closeModal();
});

if (auth) {
  onAuthStateChanged(auth, (user) => {
    currentUser = user
      ? {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          personName: getStoredPersonName(user.uid),
        }
      : null;
    refreshOpenModal();
  });
}

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
