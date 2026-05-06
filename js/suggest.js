// js/suggest.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
  runTransaction,
  query,
  where,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";
import {
  PEOPLE,
  PERSON_COLORS,
  PERSON_LIGHTS,
  personKey,
  getPersonNota,
  formatNota,
  notaColor,
} from "./data.js?v=desafios-soft-1";
import { normalizeText, escapeHTML } from "./utils.js";

const GENRE_TRANSLATION = {
  Action: "Ação ⚔️",
  Adventure: "Aventura 🎒",
  Comedy: "Comédia 🤣",
  Drama: "Drama 🎭",
  Fantasy: "Fantasia 🧙",
  Horror: "Terror 👻",
  Mystery: "Mistério 🔍",
  Romance: "Romance 💖",
  "Sci-Fi": "Ficção Científica 🚀",
  "Slice of Life": "Slice of Life 🍃",
  Sports: "Esportes ⚽",
  Supernatural: "Sobrenatural 👻",
  Psychological: "Psicológico 🧠",
  Ecchi: "Ecchi 🔥",
  Mecha: "Mecha 🤖",
  Music: "Música 🎵",
  Historical: "Histórico 📜",
  Military: "Militar 🎖️",
  Magic: "Magia 🪄",
  "Martial Arts": "Artes Marciais 🥋",
  Vampire: "Vampiro 🧛",
  Demons: "Demônios 😈",
  School: "Escola 🏫",
  Space: "Espaço 👨‍🚀",
  Samurai: "Samurai ⚔️",
  Police: "Policial 👮",
  Harem: "Harém 👫",
  Game: "Jogo 🎮",
  Parody: "Paródia 🤡",
  Isekai: "Isekai 🌍✨",
  Thriller: "Suspense 😱",
  Gourmet: "Culinária 🍳",
  "Avant Garde": "Experimental 🧪",
  Suspense: "Suspense 😱",
  "Award Winning": "Premiado 🏆",
  "Boys Love": "BL 👬",
  "Girls Love": "GL 👭",
  Hentai: "Hentai 💦",
  Bomba: "Bomba 💣",
};

async function fetchAnimeData(name) {
  const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(name)}&limit=5`);
  if (!res.ok) throw new Error("Jikan API error");
  const data = await res.json();
  const animes = data.data || [];
  return animes.map((anime) => ({
    genres: anime.genres.map((g) => GENRE_TRANSLATION[g.name] || g.name),
    malId: anime.mal_id,
    officialTitle: anime.title_english || anime.title,
    displayTitle: anime.title,
    allTitles: [
      anime.title,
      anime.title_english,
      anime.title_japanese,
      ...(anime.titles?.map((t) => t.title) || []),
    ].filter(Boolean),
  }));
}

// Estilos para o dropdown de busca
const dropdownStyles = `
  .search-results-dropdown {
    position: absolute;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    width: 100%;
    max-height: 250px;
    overflow-y: auto;
    z-index: 100;
    margin-top: 5px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }
  .search-result-item {
    padding: 10px 15px;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
    transition: background 0.2s;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .search-result-item:last-child { border-bottom: none; }
  .search-result-item:hover { background: rgba(255,255,255,0.05); }
  .search-result-info { display: flex; flex-direction: column; }
  .search-result-title { font-size: 14px; font-weight: bold; color: white; }
  .search-result-meta { font-size: 11px; color: var(--faint); }
`;
const styleSheet = document.createElement("style");
styleSheet.innerText = dropdownStyles;
document.head.appendChild(styleSheet);

function normalizeName(str) {
  return normalizeText(str)
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

async function checkDuplicates(malId, inputName, allTitles = []) {
  const found = [];
  const titlesToCheck = new Set([inputName, ...allTitles].filter(Boolean).map(normalizeName));

  if (db) {
    if (malId) {
      const [animesSnap, pendingSnap] = await Promise.all([
        getDocs(query(collection(db, "animes"), where("malId", "==", malId))),
        getDocs(query(collection(db, "pending_animes"), where("malId", "==", malId))),
      ]);
      animesSnap.forEach((d) => found.push(d.data().nome));
      pendingSnap.forEach((d) => found.push(d.data().nome));
    }

    if (found.length === 0) {
      const pendingAll = await getDocs(collection(db, "pending_animes"));
      pendingAll.forEach((d) => {
        if (titlesToCheck.has(normalizeName(d.data().nome))) found.push(d.data().nome);
      });
    }

    if (found.length === 0) {
      const animesAll = await getDocs(collection(db, "animes"));
      animesAll.forEach((d) => {
        if (titlesToCheck.has(normalizeName(d.data().nome))) found.push(d.data().nome);
      });
    }
  }

  if (found.length > 0) return found;

  try {
    const res = await fetch("data/animes.json");
    const data = await res.json();
    for (const anime of data.animes || []) {
      if (titlesToCheck.has(normalizeName(anime.nome))) found.push(anime.nome);
    }
  } catch {}

  return found;
}

let currentAnimeData = null;
const isFirebaseConfigured = firebaseConfig.apiKey !== "SUA_API_KEY";
let app, auth, db;
let currentUser = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

const pendingAnimesRef = isFirebaseConfigured ? collection(db, "pending_animes") : null;
const submissionFormContainer = document.getElementById("submission-form-container");
const pendingAnimesContainer = document.getElementById("pending-animes-container");
const userNavContainer = document.getElementById("user-nav");

function renderLoginLogoutButton() {
  if (!isFirebaseConfigured || !userNavContainer) return;

  if (currentUser) {
    userNavContainer.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px">
        <a href="#" id="user-profile-link" style="display:flex; align-items:center; gap:8px; text-decoration:none; color:inherit">
          <span class="nav-avatar" style="background: ${PERSON_LIGHTS[currentUser.personName] || "rgba(255,255,255,0.1)"}; color: ${PERSON_COLORS[currentUser.personName] || "#fff"}; width:24px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-size:12px; font-weight:bold">
            ${currentUser.personName ? currentUser.personName[0] : "?"}
          </span>
          <span style="font-size:14px">${currentUser.personName || "Selecionar Nome"}</span>
        </a>
        <button id="logout-button" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Sair</button>
      </div>
    `;
    document.getElementById("logout-button")?.addEventListener("click", handleLogout);
    if (!currentUser.personName) {
      document.getElementById("user-profile-link")?.addEventListener("click", (e) => {
        e.preventDefault();
        showUserSelectionModal();
      });
    } else {
      document
        .getElementById("user-profile-link")
        ?.addEventListener("click", (e) => e.preventDefault());
    }
  } else {
    userNavContainer.innerHTML =
      "<button id='login-button' style='padding: 6px 12px; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer;'>Login com Google</button>";
    document.getElementById("login-button")?.addEventListener("click", handleLogin);
  }
}

function showUserSelectionModal() {
  const overlay = document.createElement("div");
  overlay.id = "user-selection-overlay";
  overlay.style =
    "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:1000;";
  const modal = document.createElement("div");
  modal.style =
    "background:var(--card-bg); padding:30px; border-radius:12px; max-width:400px; width:90%; border:1px solid var(--border)";

  let optionsHtml = PEOPLE.map(
    (p) => `
        <button class="person-select-btn" data-name="${p}" style="display:block; width:100%; padding:12px; margin-bottom:10px; background:rgba(255,255,255,0.05); color:white; border:1px solid var(--border); border-radius:8px; cursor:pointer; text-align:left; font-size:16px">
            <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${PERSON_COLORS[p]}; margin-right:10px"></span>
            ${p}
        </button>
    `,
  ).join("");

  modal.innerHTML = `<h3 style="margin-top:0; margin-bottom:20px; color:white">Quem é você?</h3>${optionsHtml}`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  modal.querySelectorAll(".person-select-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      associateUserWithPerson(btn.getAttribute("data-name"));
      document.body.removeChild(overlay);
    });
  });
}

async function associateUserWithPerson(personName) {
  if (!currentUser) return;
  localStorage.setItem(`user-${currentUser.uid}-personName`, personName);
  currentUser.personName = personName;
  renderUIForUser(currentUser);
}

async function renderSubmissionForm() {
  if (!submissionFormContainer) return;
  if (!currentUser) {
    submissionFormContainer.innerHTML = `<div style="text-align:center; padding:20px; border:1px dashed var(--border); border-radius:8px"><p style="color:var(--faint)">Faça login para sugerir novos animes.</p><button id="login-prompt-btn" style="margin-top:10px; padding:8px 16px; background:var(--accent); color:white; border:none; border-radius:4px; cursor:pointer">Fazer Login</button></div>`;
    document.getElementById("login-prompt-btn")?.addEventListener("click", handleLogin);
    return;
  }
  if (!currentUser.personName) {
    submissionFormContainer.innerHTML = `<div style="text-align:center; padding:20px; border:1px dashed var(--border); border-radius:8px"><p style="color:var(--faint)">Associe seu nome antes de sugerir.</p><button id="select-name-prompt" style="margin-top:10px; padding:8px 16px; background:var(--accent); color:white; border:none; border-radius:4px; cursor:pointer">Selecionar Meu Nome</button></div>`;
    document
      .getElementById("select-name-prompt")
      ?.addEventListener("click", showUserSelectionModal);
    return;
  }

  submissionFormContainer.innerHTML = `
    <div class="form-group" style="position: relative;">
      <label>Nome do Anime</label>
      <input type="text" id="anime-name" placeholder="Ex: Full Metal" autocomplete="off" required />
      <div id="search-results-list" class="search-results-dropdown" style="display: none;"></div>
      <div id="official-title" style="font-size:12px; color:#34d399; margin-top:4px; min-height:16px"></div>
      <div id="duplicate-warning" style="font-size:12px; color:#f59e0b; margin-top:4px; min-height:16px"></div>
    </div>
    <div class="form-group">
      <label>Gêneros <span id="genres-status" style="font-size:12px; font-weight:normal; color:var(--faint)"></span></label>
      <input type="text" id="anime-genres" placeholder="Selecione um anime acima para preencher" />
    </div>
    <div class="form-group">
      <label>Submetido por</label>
      <input type="text" value="${currentUser.personName}" readonly disabled style="background:rgba(255,255,255,0.05); color:var(--faint)" />
    </div>
    <div class="form-group">
      <label>Links <span style="font-weight:normal;color:var(--faint);font-size:12px">(opcional — opening, onde assistir, etc.)</span></label>
      <div id="suggest-links-list"></div>
      <button type="button" onclick="toggleSuggestLinkForm()" style="margin-top:4px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--muted);cursor:pointer;font-size:12px;font-weight:700;padding:6px 12px">+ Adicionar link</button>
      <div id="suggest-link-form" style="display:none;margin-top:8px">
        <input id="suggest-link-name" type="text" placeholder="Nome (ex: Opening 1, Crunchyroll...)" maxlength="60"
               style="width:100%;margin-bottom:6px;padding:8px 10px;background:rgba(0,0,0,0.2);border:1px solid var(--border);border-radius:6px;color:white;font-size:13px" />
        <input id="suggest-link-url" type="url" placeholder="https://..." maxlength="500"
               style="width:100%;margin-bottom:8px;padding:8px 10px;background:rgba(0,0,0,0.2);border:1px solid var(--border);border-radius:6px;color:white;font-size:13px" />
        <div style="display:flex;gap:6px;align-items:center">
          <button type="button" onclick="addSuggestLink()" style="background:var(--accent);border:none;border-radius:6px;color:white;cursor:pointer;font-size:12px;font-weight:700;padding:6px 14px">Adicionar</button>
          <button type="button" onclick="toggleSuggestLinkForm()" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--muted);cursor:pointer;font-size:12px;padding:6px 10px">Cancelar</button>
          <span id="suggest-link-status" style="font-size:11px;color:var(--muted)"></span>
        </div>
      </div>
    </div>
    <button id="submit-anime-button" class="suggest-submit">Submeter Anime</button>
  `;

  const submitBtn = document.getElementById("submit-anime-button");
  const animeNameInput = document.getElementById("anime-name");
  const resultsDropdown = document.getElementById("search-results-list");
  const statusEl = document.getElementById("genres-status");
  const officialEl = document.getElementById("official-title");
  const duplicateEl = document.getElementById("duplicate-warning");

  submitBtn?.addEventListener("click", handleSubmitAnime);

  let searchDebounce;

  const selectAnime = async (animeData) => {
    currentAnimeData = animeData;
    animeNameInput.value = animeData.displayTitle;
    document.getElementById("anime-genres").value = animeData.genres.join(", ");
    officialEl.textContent = `✓ Selecionado: ${animeData.officialTitle}`;
    if (statusEl) {
      statusEl.textContent = "✓ dados carregados";
      statusEl.style.color = "#34d399";
    }
    resultsDropdown.style.display = "none";

    const duplicates = await checkDuplicates(animeData.malId, animeData.displayTitle, animeData.allTitles);
    if (duplicates.length > 0) {
      duplicateEl.textContent = `🚫 "${duplicates[0]}" já existe`;
      submitBtn.disabled = true;
    } else {
      duplicateEl.textContent = "";
      submitBtn.disabled = false;
    }
  };

  animeNameInput?.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    const name = animeNameInput.value.trim();

    if (name.length < 3) {
      resultsDropdown.style.display = "none";
      if (officialEl) officialEl.textContent = "";
      if (duplicateEl) duplicateEl.textContent = "";
      return;
    }

    if (statusEl) statusEl.textContent = "buscando...";
    if (submitBtn) submitBtn.disabled = true;

    searchDebounce = setTimeout(async () => {
      try {
        const results = await fetchAnimeData(name);

        if (results.length > 0) {
          resultsDropdown.innerHTML = results
            .map(
              (anime, index) => `
            <div class="search-result-item" data-index="${index}">
              <div class="search-result-info">
                <span class="search-result-title">${anime.displayTitle}</span>
                <span class="search-result-meta">${anime.officialTitle !== anime.displayTitle ? anime.officialTitle : ""}</span>
              </div>
            </div>
          `,
            )
            .join("");

          resultsDropdown.style.display = "block";

          resultsDropdown.querySelectorAll(".search-result-item").forEach((item) => {
            item.addEventListener("click", () => {
              const index = item.getAttribute("data-index");
              selectAnime(results[index]);
            });
          });
        } else {
          resultsDropdown.style.display = "none";
          if (statusEl) statusEl.textContent = "não encontrado";
          if (submitBtn) submitBtn.disabled = false;
        }
      } catch (e) {
        if (statusEl) statusEl.textContent = "erro na busca";
        if (submitBtn) submitBtn.disabled = false;
      }
    }, 500);
  });

  // Fecha o dropdown ao clicar fora
  document.addEventListener("click", (e) => {
    if (!animeNameInput.contains(e.target) && !resultsDropdown.contains(e.target)) {
      resultsDropdown.style.display = "none";
    }
  });
}

function renderPendingAnimes(animes) {
  if (!pendingAnimesContainer) return;
  if (!animes || animes.length === 0) {
    pendingAnimesContainer.innerHTML =
      "<p style='color: var(--faint); text-align:center; padding:40px'>Nenhum anime pendente no momento.</p>";
    return;
  }

  // Filtra fora os já votados pelo usuário atual
  const unvoted = animes.filter((a) => !a.votedUserIds?.includes(currentUser?.uid));

  if (unvoted.length === 0) {
    pendingAnimesContainer.innerHTML = `
      <div style="align-items:center; display:flex; flex-direction:column; gap:12px; grid-column:1/-1; padding:80px 20px; text-align:center; width:100%;">
        <div style="font-size:48px;line-height:1">✅</div>
        <p style="font-size:22px; font-weight:800; color:#86efac; margin:0">Você votou em todos!</p>
        <p style="color:rgba(134,239,172,0.55); font-size:14px; margin:0">Confira seu histórico de votos clicando no botão acima.</p>
        <a href="historico.html" style="
          background: linear-gradient(rgba(10,16,12,0.9),rgba(10,16,12,0.9)) padding-box,
            linear-gradient(135deg,rgba(134,239,172,0.55),rgba(253,230,138,0.38)) border-box;
          border:1.5px solid transparent; border-radius:999px; color:#86efac;
          font-size:13px; font-weight:800; margin-top:8px; padding:10px 22px; text-decoration:none;
        ">Ver histórico →</a>
      </div>`;
    return;
  }

  pendingAnimesContainer.innerHTML = unvoted
    .map((anime) => {
      const isVoted = false;
      const userVote = null;

      let dots = PEOPLE.map((p) => {
        const hasVoted = anime.votes && anime.votes[p];
        const color = PERSON_COLORS[p] || "#ccc";
        const lightColor = PERSON_LIGHTS[p] || "rgba(255,255,255,0.1)";
        return `
          <span title="${p}: ${hasVoted ? "Já votou" : "Pendente"}" 
                style="display:inline-flex; width:22px; height:22px; border-radius:50%; 
                       align-items:center; justify-content:center; font-size:11px; font-weight:bold;
                       margin-right:4px; border: 1px solid ${hasVoted ? color : "rgba(255,255,255,0.1)"};
                       background: ${hasVoted ? lightColor : "transparent"}; 
                       color: ${hasVoted ? color : "rgba(255,255,255,0.2)"};
                       opacity: ${hasVoted ? "1" : "0.5"}">
            ${p[0]}
          </span>`;
      }).join("");

      return `
      <div class="vote-card" style="background:var(--card-bg); border:1px solid var(--border); margin-bottom:20px; border-radius:12px; padding:20px">
        <div style="display:flex; justify-content:space-between; align-items: flex-start;">
            <h3 style="margin:0">${anime.nome}</h3>
            <div style="display:flex">${dots}</div>
        </div>
        <div class="pending-genres">${(anime.generos || []).map((g) => `<span class="pending-genre-chip">${g}</span>`).join("")}</div>
        <div style="font-size:12px; color:var(--faint); margin-bottom:12px">Sugerido por <strong style="color:${PERSON_LIGHTS[anime.submittedByName] || "var(--paper)"}">${anime.submittedByName}</strong></div>
        ${renderPendingLinksSection(anime)}
        ${
          currentUser
            ? `
            <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:15px">
                ${
                  !currentUser.personName
                    ? `<p><a href="#" onclick="showUserSelectionModal(); return false;">Associe seu nome</a> para votar.</p>`
                    : isVoted
                      ? `<p style="color:#34d399">✓ Votado: ${userVote?.score !== null ? userVote.score.toFixed(1) : "Não assisti"}</p><button onclick="handleEditVote('${anime.id}')" style="background:none; border:none; color:var(--faint); font-size:12px; text-decoration:underline; cursor:pointer">Editar</button>`
                      : `
                    <div class="vote-controls">
                        <div style="display:flex; gap:15px; margin-bottom:15px">
                            <label><input type="radio" name="watch-status-${anime.id}" value="watched" checked onchange="document.getElementById('watched-fields-${anime.id}').style.display='block'"> Assisti</label>
                            <label><input type="radio" name="watch-status-${anime.id}" value="not-watched" onchange="document.getElementById('watched-fields-${anime.id}').style.display='none'"> Não assisti</label>
                        </div>
                        <div id="watched-fields-${anime.id}">
                            <div style="display:flex; justify-content:space-between"><span style="font-size:12px">Nota: <strong id="score-val-${anime.id}">5.0</strong></span></div>
                            <input type="range" id="score-${anime.id}" min="0" max="10" step="0.1" value="5.0" style="width:100%" oninput="document.getElementById('score-val-${anime.id}').innerText=parseFloat(this.value).toFixed(1)">
                            <textarea id="comment-${anime.id}" placeholder="Comentário (opcional)" style="width:100%; margin-top:10px; background:rgba(0,0,0,0.2); border:1px solid var(--border); color:white; border-radius:6px"></textarea>
                        </div>
                        <button onclick="handleCastVote('${anime.id}')" style="margin-top:15px; width:100%; padding:10px; background:var(--accent); border:none; color:white; border-radius:6px; cursor:pointer; font-weight:bold">Confirmar Voto</button>
                    </div>
                `
                }
            </div>
        `
            : ""
        }
      </div>
    `;
    })
    .join("");
}

window.handleCastVote = async (animeId) => {
  if (!currentUser?.personName) return;
  const watchStatus = document.querySelector(`input[name="watch-status-${animeId}"]:checked`).value;
  const score =
    watchStatus === "watched"
      ? parseFloat(document.getElementById(`score-${animeId}`).value)
      : null;
  const comment =
    watchStatus === "watched" ? document.getElementById(`comment-${animeId}`).value : "";
  try {
    const docRef = doc(db, "pending_animes", animeId);
    await runTransaction(db, async (t) => {
      const snap = await t.get(docRef);
      const data = snap.data();
      const votes = data.votes || {};
      const votedUserIds = data.votedUserIds || [];
      votes[currentUser.personName] = { score, comment, votedAt: new Date() };
      if (!votedUserIds.includes(currentUser.uid)) votedUserIds.push(currentUser.uid);
      t.update(docRef, { votes, votedUserIds });
    });
    alert("Voto registrado!");
  } catch (e) {
    alert("Erro ao votar.");
  }
};

window.handleEditVote = (animeId) => {
  const animeIdx = lastAnimesData.findIndex((a) => a.id === animeId);
  if (animeIdx === -1) return;
  const updatedAnime = {
    ...lastAnimesData[animeIdx],
    votedUserIds: lastAnimesData[animeIdx].votedUserIds.filter((id) => id !== currentUser.uid),
  };
  const newAnimes = [...lastAnimesData];
  newAnimes[animeIdx] = updatedAnime;
  renderPendingAnimes(newAnimes);
};

window.showUserSelectionModal = showUserSelectionModal;
async function handleLogin() {
  await signInWithPopup(auth, new GoogleAuthProvider());
}
async function handleLogout() {
  await signOut(auth);
}

async function processUser(user) {
  const storedPersonName = localStorage.getItem(`user-${user.uid}-personName`);
  currentUser = {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    personName: storedPersonName,
  };
  if (!storedPersonName) showUserSelectionModal();
}

function renderUIForUser(user) {
  renderLoginLogoutButton();
  renderSubmissionForm();
}

async function handleSubmitAnime() {
  const name = document.getElementById("anime-name")?.value.trim();
  const genresRaw = document.getElementById("anime-genres")?.value.trim();
  if (!name || !genresRaw) {
    alert("Preencha todos os campos.");
    return;
  }
  const submitBtn = document.getElementById("submit-anime-button");
  submitBtn.disabled = true;
  try {
    const duplicates = await checkDuplicates(currentAnimeData?.malId, name, currentAnimeData?.allTitles);
    if (duplicates.length > 0) {
      alert(`🚫 "${duplicates[0]}" já está na lista.`);
      return;
    }
    await addDoc(pendingAnimesRef, {
      nome: name,
      generos: genresRaw
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean),
      malId: currentAnimeData?.malId || null,
      submittedBy: currentUser.uid,
      submittedByName: currentUser.personName,
      createdAt: serverTimestamp(),
      votes: {},
      votedUserIds: [],
      status: "pending",
      files: suggestLinks.map((l) => ({ ...l })),
    });
    alert("Anime sugerido!");
    document.getElementById("anime-name").value = "";
    document.getElementById("anime-genres").value = "";
    document.getElementById("official-title").textContent = "";
    currentAnimeData = null;
    suggestLinks = [];
  } catch (e) {
    alert("Erro ao sugerir.");
  } finally {
    submitBtn.disabled = false;
  }
}

let unsubscribePendingListener = null;
let lastAnimesData = [];
let suggestLinks = []; // links adicionados no formulário de sugestão

// ── Helpers de links no formulário de sugestão ──────────────────────────────

function renderSuggestLinksList() {
  const el = document.getElementById("suggest-links-list");
  if (!el) return;
  el.innerHTML = suggestLinks.length
    ? suggestLinks
        .map(
          (f, i) => `
          <div>
            <div class="pending-link-chip-wrap">
              <span class="pending-link-chip" title="${escapeHTML(f.url)}">${escapeHTML(f.name)}</span>
              <button type="button" onclick="startEditSuggestLink(${i})" class="pending-link-edit" title="Editar link">✎</button>
              <button type="button" onclick="removeSuggestLink(${i})" class="pending-link-delete" title="Remover link">×</button>
            </div>
            <div id="suggest-link-edit-${i}" style="display:none;margin:6px 0 10px">
              <input id="suggest-link-ename-${i}" type="text" value="${escapeHTML(f.name)}" maxlength="60" placeholder="Nome do link"
                     style="width:100%;margin-bottom:6px;background:rgba(0,0,0,0.2);border:1px solid rgba(42,157,180,0.25);border-radius:6px;padding:7px 10px;color:white;font-size:13px" />
              <input id="suggest-link-eurl-${i}" type="url" value="${escapeHTML(f.url)}" maxlength="500" placeholder="https://..."
                     style="width:100%;margin-bottom:8px;background:rgba(0,0,0,0.2);border:1px solid rgba(42,157,180,0.25);border-radius:6px;padding:7px 10px;color:white;font-size:13px" />
              <div style="display:flex;gap:6px;align-items:center">
                <button type="button" onclick="saveEditSuggestLink(${i})" style="background:rgba(42,157,180,0.8);border:none;border-radius:6px;color:white;cursor:pointer;font-size:12px;font-weight:700;padding:6px 14px">Salvar</button>
                <button type="button" onclick="cancelEditSuggestLink(${i})" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--muted);cursor:pointer;font-size:12px;padding:6px 10px">Cancelar</button>
                <span id="suggest-link-estatus-${i}" style="font-size:11px;color:var(--muted)"></span>
              </div>
            </div>
          </div>`,
        )
        .join("")
    : "";
}

window.startEditSuggestLink = (idx) => {
  document.getElementById(`suggest-link-edit-${idx}`)?.style.setProperty("display", "block");
};

window.cancelEditSuggestLink = (idx) => {
  document.getElementById(`suggest-link-edit-${idx}`)?.style.setProperty("display", "none");
};

window.saveEditSuggestLink = (idx) => {
  const name = document.getElementById(`suggest-link-ename-${idx}`)?.value.trim();
  const url = document.getElementById(`suggest-link-eurl-${idx}`)?.value.trim();
  const statusEl = document.getElementById(`suggest-link-estatus-${idx}`);
  if (!name || !url) { if (statusEl) statusEl.textContent = "Preencha nome e URL."; return; }
  try { new URL(url); } catch { if (statusEl) statusEl.textContent = "URL inválida."; return; }
  suggestLinks[idx] = { name, url };
  renderSuggestLinksList();
};

window.toggleSuggestLinkForm = () => {
  const form = document.getElementById("suggest-link-form");
  if (!form) return;
  const showing = form.style.display !== "none";
  form.style.display = showing ? "none" : "block";
  if (!showing) document.getElementById("suggest-link-name")?.focus();
};

window.addSuggestLink = () => {
  const nameEl = document.getElementById("suggest-link-name");
  const urlEl = document.getElementById("suggest-link-url");
  const statusEl = document.getElementById("suggest-link-status");
  const name = nameEl?.value.trim();
  const url = urlEl?.value.trim();
  if (!name || !url) { if (statusEl) statusEl.textContent = "Preencha nome e URL."; return; }
  try { new URL(url); } catch { if (statusEl) statusEl.textContent = "URL inválida."; return; }
  suggestLinks.push({ name, url });
  renderSuggestLinksList();
  nameEl.value = "";
  urlEl.value = "";
  if (statusEl) statusEl.textContent = "";
  document.getElementById("suggest-link-form").style.display = "none";
};

window.removeSuggestLink = (idx) => {
  suggestLinks.splice(idx, 1);
  renderSuggestLinksList();
};

// ── Helpers de links nos cards pendentes ────────────────────────────────────

function renderPendingLinksSection(anime) {
  const files = anime.files || [];
  const canEdit = !!currentUser?.personName;
  const id = anime.id;

  const listHtml = files
    .map(
      (f, i) => `
      <div>
        <div class="pending-link-chip-wrap">
          <a href="${escapeHTML(f.url)}" target="_blank" rel="noopener noreferrer"
             class="pending-link-chip" title="${escapeHTML(f.url)}">
            ${escapeHTML(f.name)}
          </a>
          ${canEdit ? `
            <button onclick="startEditLinkPending('${id}',${i})" class="pending-link-edit" title="Editar link">✎</button>
            <button onclick="deleteLinkPending('${id}',${i})" class="pending-link-delete" title="Remover link">×</button>` : ""}
        </div>
        ${canEdit ? `
        <div id="pend-link-edit-${id}-${i}" style="display:none;margin:6px 0 10px">
          <input id="pend-link-ename-${id}-${i}" type="text" value="${escapeHTML(f.name)}" maxlength="60" placeholder="Nome do link"
                 style="width:100%;margin-bottom:6px;background:rgba(0,0,0,0.25);border:1px solid rgba(42,157,180,0.25);border-radius:6px;padding:7px 10px;color:white;font-size:13px" />
          <input id="pend-link-eurl-${id}-${i}" type="url" value="${escapeHTML(f.url)}" maxlength="500" placeholder="https://..."
                 style="width:100%;margin-bottom:8px;background:rgba(0,0,0,0.25);border:1px solid rgba(42,157,180,0.25);border-radius:6px;padding:7px 10px;color:white;font-size:13px" />
          <div style="display:flex;gap:6px;align-items:center">
            <button onclick="saveEditLinkPending('${id}',${i})" style="background:rgba(42,157,180,0.8);border:none;border-radius:6px;color:white;cursor:pointer;font-size:12px;font-weight:700;padding:6px 14px">Salvar</button>
            <button onclick="cancelEditLinkPending('${id}',${i})" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--muted);cursor:pointer;font-size:12px;padding:6px 10px">Cancelar</button>
            <span id="pend-link-estatus-${id}-${i}" style="font-size:11px;color:var(--muted)"></span>
          </div>
        </div>` : ""}
      </div>`,
    )
    .join("");

  const addFormHtml = canEdit
    ? `
      <div id="pending-link-add-${id}" style="display:none;margin-top:8px">
        <input id="pending-link-name-${id}" type="text" placeholder="Nome do link" maxlength="60"
               style="width:100%;margin-bottom:6px;background:rgba(0,0,0,0.25);border:1px solid rgba(42,157,180,0.25);border-radius:6px;padding:7px 10px;color:white;font-size:13px" />
        <input id="pending-link-url-${id}" type="url" placeholder="https://..." maxlength="500"
               style="width:100%;margin-bottom:8px;background:rgba(0,0,0,0.25);border:1px solid rgba(42,157,180,0.25);border-radius:6px;padding:7px 10px;color:white;font-size:13px" />
        <div style="display:flex;gap:6px;align-items:center">
          <button onclick="saveAddLinkPending('${id}')" style="background:rgba(42,157,180,0.8);border:none;border-radius:6px;color:white;cursor:pointer;font-size:12px;font-weight:700;padding:6px 14px">Salvar</button>
          <button onclick="toggleAddLinkPending('${id}')" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--muted);cursor:pointer;font-size:12px;padding:6px 10px">Cancelar</button>
          <span id="pending-link-status-${id}" style="font-size:11px;color:var(--muted)"></span>
        </div>
      </div>
      <button onclick="toggleAddLinkPending('${id}')" class="pending-link-add-btn">+ Link</button>`
    : "";

  return `
    <div style="margin-bottom:14px">
      ${files.length ? `<div style="font-size:10px;font-weight:800;letter-spacing:.1em;color:var(--faint);text-transform:uppercase;margin-bottom:6px">Links</div>` : ""}
      ${listHtml}
      ${addFormHtml}
    </div>`;
}

window.startEditLinkPending = (animeId, idx) => {
  document.getElementById(`pend-link-edit-${animeId}-${idx}`)?.style.setProperty("display", "block");
};

window.cancelEditLinkPending = (animeId, idx) => {
  document.getElementById(`pend-link-edit-${animeId}-${idx}`)?.style.setProperty("display", "none");
};

window.saveEditLinkPending = async (animeId, idx) => {
  if (!currentUser || !db) return;
  const nameEl = document.getElementById(`pend-link-ename-${animeId}-${idx}`);
  const urlEl = document.getElementById(`pend-link-eurl-${animeId}-${idx}`);
  const statusEl = document.getElementById(`pend-link-estatus-${animeId}-${idx}`);
  const name = nameEl?.value.trim();
  const url = urlEl?.value.trim();
  if (!name || !url) { if (statusEl) statusEl.textContent = "Preencha nome e URL."; return; }
  try { new URL(url); } catch { if (statusEl) statusEl.textContent = "URL inválida."; return; }
  if (statusEl) statusEl.textContent = "Salvando...";
  try {
    const anime = lastAnimesData.find((a) => a.id === animeId);
    const newFiles = [...(anime?.files || [])];
    newFiles[idx] = { name, url };
    await updateDoc(doc(db, "pending_animes", animeId), { files: newFiles });
  } catch (e) {
    if (statusEl) statusEl.textContent = "Erro ao salvar.";
  }
};

window.toggleAddLinkPending = (animeId) => {
  const form = document.getElementById(`pending-link-add-${animeId}`);
  if (!form) return;
  form.style.display = form.style.display === "none" ? "block" : "none";
  if (form.style.display === "block") document.getElementById(`pending-link-name-${animeId}`)?.focus();
};

window.saveAddLinkPending = async (animeId) => {
  if (!currentUser || !db) return;
  const nameEl = document.getElementById(`pending-link-name-${animeId}`);
  const urlEl = document.getElementById(`pending-link-url-${animeId}`);
  const statusEl = document.getElementById(`pending-link-status-${animeId}`);
  const name = nameEl?.value.trim();
  const url = urlEl?.value.trim();
  if (!name || !url) { if (statusEl) statusEl.textContent = "Preencha nome e URL."; return; }
  try { new URL(url); } catch { if (statusEl) statusEl.textContent = "URL inválida."; return; }
  if (statusEl) statusEl.textContent = "Salvando...";
  try {
    const anime = lastAnimesData.find((a) => a.id === animeId);
    const newFiles = [...(anime?.files || []), { name, url }];
    await updateDoc(doc(db, "pending_animes", animeId), { files: newFiles });
  } catch (e) {
    if (statusEl) statusEl.textContent = "Erro ao salvar.";
  }
};

window.deleteLinkPending = async (animeId, idx) => {
  if (!currentUser || !db) return;
  try {
    const anime = lastAnimesData.find((a) => a.id === animeId);
    const newFiles = (anime?.files || []).filter((_, i) => i !== idx);
    await updateDoc(doc(db, "pending_animes", animeId), { files: newFiles });
  } catch (e) {
    console.error(e);
  }
};

function startPendingAnimesListener() {
  if (!db || !currentUser || !pendingAnimesContainer) return;
  if (unsubscribePendingListener) unsubscribePendingListener();
  const q = query(pendingAnimesRef, orderBy("createdAt", "desc"));
  unsubscribePendingListener = onSnapshot(
    q,
    (snapshot) => {
      const animes = [];
      snapshot.forEach((doc) => animes.push({ ...doc.data(), id: doc.id }));
      lastAnimesData = animes;
      renderPendingAnimes(animes);
    },
    (e) => {
      console.error(e);
      pendingAnimesContainer.innerHTML =
        "<p style='color:var(--error); text-align:center; padding:40px'>Erro ao carregar fila.</p>";
    },
  );
}

async function init() {
  if (!isFirebaseConfigured) return;

  // Espera a navbar estar no DOM antes de prosseguir
  const start = async () => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        await processUser(user);
        renderUIForUser(currentUser);
        startPendingAnimesListener();
      } else {
        currentUser = null;
        if (unsubscribePendingListener) {
          unsubscribePendingListener();
          unsubscribePendingListener = null;
        }
        renderUIForUser(null);
        if (pendingAnimesContainer)
          pendingAnimesContainer.innerHTML =
            "<p style='color:var(--faint); text-align:center; padding:40px'>Faça login para ver a fila.</p>";
      }
    });
  };

  // Se a navbar já carregou, inicia. Se não, espera o evento.
  if (document.getElementById("user-nav")) {
    start();
  } else {
    document.addEventListener("navbar-loaded", start);
  }
}

init();
