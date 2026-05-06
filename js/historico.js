import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";
import { PEOPLE, PERSON_COLORS, PERSON_LIGHTS } from "./data.js?v=desafios-soft-1";
import { escapeHTML } from "./utils.js";

const isConfigured = firebaseConfig.apiKey !== "SUA_API_KEY";
const app = isConfigured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

const container = document.getElementById("historico-container");

// State acessível pelos handlers globais
let _currentUser = null;

function getVoteLabel(vote) {
  if (!vote) return "—";
  if (vote.score === null || vote.score === undefined) return "Não assisti";
  return Number(vote.score).toFixed(1);
}

function buildEditForm(animeId, myVote) {
  const hasScore = myVote?.score !== null && myVote?.score !== undefined;
  const score = hasScore ? Number(myVote.score).toFixed(1) : "7.0";
  const comment = myVote?.comment ? myVote.comment : "";

  return `
    <div id="vote-edit-${animeId}" style="display:none; margin-top:8px">
      <div style="display:flex;gap:12px;margin-bottom:10px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--muted)">
          <input type="radio" name="hedit-watch-${animeId}" value="watched"
            ${hasScore ? "checked" : ""}
            onchange="document.getElementById('hedit-score-wrap-${animeId}').style.display='block'"
          /> Assisti
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--muted)">
          <input type="radio" name="hedit-watch-${animeId}" value="not_watched"
            ${!hasScore ? "checked" : ""}
            onchange="document.getElementById('hedit-score-wrap-${animeId}').style.display='none'"
          /> Não assisti
        </label>
      </div>
      <div id="hedit-score-wrap-${animeId}" style="display:${hasScore ? "block" : "none"}">
        <div style="margin-bottom:8px">
          <label style="font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--faint);text-transform:uppercase">Nota (0–10)</label>
          <input id="hedit-score-${animeId}" type="number" min="0" max="10" step="0.1" value="${score}"
            style="margin-top:4px;width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px 10px;color:var(--text);font-size:14px;font-weight:700" />
        </div>
        <div style="margin-bottom:10px">
          <label style="font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--faint);text-transform:uppercase">Comentário (opcional)</label>
          <textarea id="hedit-comment-${animeId}" maxlength="400" placeholder="Seu comentário..."
            style="margin-top:4px;width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px 10px;color:var(--text);font-size:13px;resize:vertical;min-height:64px">${escapeHTML(comment)}</textarea>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <button id="hedit-save-${animeId}"
          onclick="saveEditVoteHistorico('${animeId}')"
          style="background:#22c55e;border:none;border-radius:8px;color:#fff;cursor:pointer;font-size:13px;font-weight:800;padding:8px 16px">
          Salvar
        </button>
        <button onclick="cancelEditVoteHistorico('${animeId}')"
          style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:var(--muted);cursor:pointer;font-size:13px;font-weight:600;padding:8px 14px">
          Cancelar
        </button>
        <span id="hedit-status-${animeId}" style="font-size:12px;color:var(--muted)"></span>
      </div>
    </div>`;
}

function renderHistorico(animes, currentUser) {
  if (!container) return;
  _currentUser = currentUser;

  const voted = animes.filter((a) => a.votedUserIds?.includes(currentUser.uid));

  if (!voted.length) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px; color:var(--muted)">
        <div style="font-size:48px; margin-bottom:16px">📭</div>
        <p style="font-size:16px; font-weight:700; color:var(--paper)">Nenhum voto ainda</p>
        <p>Você ainda não votou em nenhum anime da fila de aprovação.</p>
        <a href="pending.html" style="color:var(--hacksuya-light); font-weight:800; margin-top:16px; display:inline-block">← Ir para a fila</a>
      </div>`;
    return;
  }

  const person = currentUser.personName;
  const color = PERSON_LIGHTS[person] || "#a78bfa";

  container.innerHTML = `
    <div style="margin-bottom:20px; color:var(--muted); font-size:14px">
      ${voted.length} anime${voted.length !== 1 ? "s" : ""} votado${voted.length !== 1 ? "s" : ""} por <strong style="color:${color}">${person}</strong>
    </div>
    <div id="pending-animes-container">
      ${voted
        .map((anime) => {
          const myVote = person ? anime.votes?.[person] : null;
          const myLabel = getVoteLabel(myVote);
          const myColor =
            myVote?.score !== null && myVote?.score !== undefined ? "#86efac" : "#fde68a";

          const dots = PEOPLE.map((p) => {
            const hasVoted = anime.votes && anime.votes[p];
            const c = PERSON_COLORS[p] || "#ccc";
            const lc = PERSON_LIGHTS[p] || "rgba(255,255,255,0.1)";
            return `<span title="${p}: ${hasVoted ? "Já votou" : "Pendente"}"
            style="display:inline-flex;width:22px;height:22px;border-radius:50%;
                   align-items:center;justify-content:center;font-size:11px;font-weight:bold;
                   margin-right:4px;border:1px solid ${hasVoted ? c : "rgba(255,255,255,0.1)"};
                   background:${hasVoted ? lc : "transparent"};color:${hasVoted ? c : "rgba(255,255,255,0.2)"};
                   opacity:${hasVoted ? "1" : "0.5"}">${p[0]}</span>`;
          }).join("");

          const otherVotes = PEOPLE.filter((p) => p !== person && anime.votes?.[p])
            .map((p) => {
              const v = anime.votes[p];
              const lbl = getVoteLabel(v);
              return `<span class="pending-genre-chip" style="color:${PERSON_LIGHTS[p]}">${p}: ${lbl}</span>`;
            })
            .join("");

          return `
          <div class="vote-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <h3 style="margin:0">${escapeHTML(anime.nome)}</h3>
              <div style="display:flex">${dots}</div>
            </div>
            <div class="pending-genres">${(anime.generos || []).map((g) => `<span class="pending-genre-chip">${g}</span>`).join("")}</div>
            <div style="font-size:12px;color:var(--faint);margin-bottom:12px">
              Sugerido por <strong style="color:${PERSON_LIGHTS[anime.submittedByName] || "var(--paper)"}">${escapeHTML(anime.submittedByName || "")}</strong>
            </div>

            <div id="vote-display-${anime.id}" style="background:rgba(255,255,255,0.03);border:1px solid rgba(134,239,172,0.1);border-radius:16px;padding:14px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div style="color:${myColor};font-weight:800;font-size:14px;margin-bottom:${otherVotes ? "12px" : "0"}">
                  ✓ Meu voto: ${myLabel}
                  ${myVote?.comment ? `<div style="color:var(--muted);font-size:12px;font-weight:600;margin-top:6px">"${escapeHTML(myVote.comment)}"</div>` : ""}
                </div>
                <button onclick="startEditVoteHistorico('${anime.id}')"
                  title="Editar voto"
                  style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:var(--muted);cursor:pointer;font-size:11px;font-weight:700;padding:5px 10px;white-space:nowrap;flex-shrink:0">
                  ✎ Editar
                </button>
              </div>
              ${otherVotes ? `<div style="display:flex;flex-wrap:wrap;gap:6px">${otherVotes}</div>` : ""}
            </div>

            ${buildEditForm(anime.id, myVote)}
          </div>`;
        })
        .join("")}
    </div>
  `;
}

window.startEditVoteHistorico = (animeId) => {
  document.getElementById(`vote-display-${animeId}`).style.display = "none";
  document.getElementById(`vote-edit-${animeId}`).style.display = "block";
};

window.cancelEditVoteHistorico = (animeId) => {
  document.getElementById(`vote-display-${animeId}`).style.display = "block";
  document.getElementById(`vote-edit-${animeId}`).style.display = "none";
};

window.saveEditVoteHistorico = async (animeId) => {
  if (!_currentUser?.personName || !db) return;

  const statusEl = document.querySelector(`input[name="hedit-watch-${animeId}"]:checked`);
  if (!statusEl) return;

  const watchStatus = statusEl.value;
  const score =
    watchStatus === "watched"
      ? parseFloat(document.getElementById(`hedit-score-${animeId}`).value)
      : null;
  const comment =
    watchStatus === "watched"
      ? (document.getElementById(`hedit-comment-${animeId}`)?.value || "").trim()
      : "";

  if (watchStatus === "watched" && (isNaN(score) || score < 0 || score > 10)) {
    document.getElementById(`hedit-status-${animeId}`).textContent = "Nota inválida (0–10).";
    return;
  }

  const saveBtn = document.getElementById(`hedit-save-${animeId}`);
  const statusMsg = document.getElementById(`hedit-status-${animeId}`);
  saveBtn.disabled = true;
  statusMsg.textContent = "Salvando...";

  try {
    const docRef = doc(db, "pending_animes", animeId);
    await runTransaction(db, async (t) => {
      const snap = await t.get(docRef);
      const data = snap.data();
      const votes = data.votes || {};
      const votedUserIds = data.votedUserIds || [];
      votes[_currentUser.personName] = { score, comment, votedAt: new Date() };
      if (!votedUserIds.includes(_currentUser.uid)) votedUserIds.push(_currentUser.uid);
      t.update(docRef, { votes, votedUserIds });
    });
    // onSnapshot re-renderiza automaticamente
  } catch (e) {
    console.error(e);
    statusMsg.textContent = "Erro ao salvar.";
    saveBtn.disabled = false;
  }
};

function init() {
  if (!auth) {
    container.innerHTML = `<p style="text-align:center;padding:40px;color:var(--faint)">Firebase não configurado.</p>`;
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      container.innerHTML = `<p style="text-align:center;padding:40px;color:var(--faint)">Faça login para ver seu histórico.</p>`;
      return;
    }

    const storedName = localStorage.getItem(`user-${user.uid}-personName`);
    const currentUser = { uid: user.uid, personName: storedName };

    const pendingRef = collection(db, "pending_animes");
    const q = query(pendingRef, orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
      const animes = [];
      snapshot.forEach((d) => animes.push({ ...d.data(), id: d.id }));
      renderHistorico(animes, currentUser);
    });
  });
}

init();
