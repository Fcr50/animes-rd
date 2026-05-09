/**
 * batalha.js v3 — Sistema de Batalha de Animes
 * Identificação por nome (sem Firebase Auth obrigatório)
 * UI completa: lobby → waiting → active → finished
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";
import {
  PEOPLE,
  PERSON_COLORS,
  PERSON_LIGHTS,
  animesOf,
  formatNota,
} from "./data.js?v=desafios-soft-1";
import { escapeHTML } from "./utils.js";

const app = getApps()[0] || initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const ROUNDS_TOTAL = 5;
const SESSIONS_COL = "battle_sessions_v2";
const VOTES_COL = "battle_votes_v2";
const MY_KEY = "batalha-my-name-v2";

// ── Utilities ─────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRounds(animes, p1, p2) {
  const s1 = new Set(animesOf(animes, p1).map((a) => a.id));
  const s2 = new Set(animesOf(animes, p2).map((a) => a.id));
  const common = animes.filter((a) => s1.has(a.id) && s2.has(a.id) && a.nota !== null);
  console.log(`[Batalha] Animes em comum entre ${p1} e ${p2}:`, common.length);
  if (common.length < ROUNDS_TOTAL * 2) return null;
  const pool = shuffle(common).slice(0, ROUNDS_TOTAL * 2);
  return Array.from({ length: ROUNDS_TOTAL }, (_, i) => ({
    animeA: { id: pool[i * 2].id, nome: pool[i * 2].nome, nota: pool[i * 2].nota },
    animeB: { id: pool[i * 2 + 1].id, nome: pool[i * 2 + 1].nome, nota: pool[i * 2 + 1].nota },
  }));
}

// ── Firebase ops ──────────────────────────────────────────────────────────────

async function createSession(animes, p1, p2) {
  console.log(`[Batalha] Criando sessão: ${p1} vs ${p2}`);
  const rounds = buildRounds(animes, p1, p2);
  if (!rounds) throw new Error(`Animes em comum insuficientes (mínimo ${ROUNDS_TOTAL * 2})`);

  const ref = await addDoc(collection(db, SESSIONS_COL), {
    player1_name: p1,
    player2_name: p2,
    player2_ready: false,
    status: "waiting",
    current_round: 1,
    rounds,
    round_results: [],
    scores: { [p1]: 0, [p2]: 0 },
    winner: null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  console.log(`[Batalha] Sessão criada: ${ref.id}`);
  return ref.id;
}

async function joinSession(sessionId) {
  await updateDoc(doc(db, SESSIONS_COL, sessionId), {
    player2_ready: true,
    status: "active",
    updated_at: serverTimestamp(),
  });
  console.log(`[Batalha] Sessão ativada: ${sessionId}`);
}

async function cancelSession(sessionId) {
  await deleteDoc(doc(db, SESSIONS_COL, sessionId));
  console.log(`[Batalha] Sessão cancelada: ${sessionId}`);
}

async function castVote(sessionId, round, playerName, animeId) {
  // Verifica duplicata — query simples por session_id, filtra client-side
  const dupSnap = await getDocs(
    query(collection(db, VOTES_COL), where("session_id", "==", sessionId)),
  );
  const dup = dupSnap.docs.filter((d) => {
    const v = d.data();
    return v.round === round && v.player_name === playerName;
  });
  if (dup.length > 0) throw new Error("Você já votou nesta rodada");

  const sessionRef = doc(db, SESSIONS_COL, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef);
    const s = snap.data();
    if (!s) throw new Error("Sessão não encontrada");
    if (s.status !== "active") throw new Error("Batalha não está ativa");
    if (s.current_round !== round) throw new Error("Rodada desatualizada");

    const rd = s.rounds[round - 1];
    if (![rd.animeA.id, rd.animeB.id].includes(animeId)) throw new Error("Anime inválido");

    tx.set(doc(collection(db, VOTES_COL)), {
      session_id: sessionId,
      round,
      player_name: playerName,
      anime_id: animeId,
      created_at: serverTimestamp(),
    });
  });

  console.log(`[Batalha] Voto: ${playerName} → anime ${animeId} (rodada ${round})`);
  await tryResolve(sessionId, round);
}

async function tryResolve(sessionId, round) {
  const allVotesSnap = await getDocs(
    query(collection(db, VOTES_COL), where("session_id", "==", sessionId)),
  );
  const votesSnap = { docs: allVotesSnap.docs.filter((d) => d.data().round === round), size: 0 };
  votesSnap.size = votesSnap.docs.length;
  console.log(`[Batalha] Votos na rodada ${round}:`, votesSnap.size);
  if (votesSnap.size < 2) return;

  const sessionRef = doc(db, SESSIONS_COL, sessionId);
  const snap = await getDoc(sessionRef);
  const s = snap.data();
  if (!s || s.current_round !== round) return;

  const voteMap = {};
  votesSnap.docs.forEach((v) => {
    const d = v.data();
    voteMap[d.player_name] = d.anime_id;
  });

  const result = { round, votes: voteMap };
  const newResults = [...(s.round_results || []), result];
  const isLast = round >= ROUNDS_TOTAL;

  const update = { round_results: newResults, updated_at: serverTimestamp() };
  if (isLast) {
    update.status = "finished";
    console.log(`[Batalha] FIM! Revelando escolhas.`);
  } else {
    update.current_round = round + 1;
    console.log(`[Batalha] Avançando para rodada ${round + 1}`);
  }

  await updateDoc(sessionRef, update);
}

// ── UI ────────────────────────────────────────────────────────────────────────

let unsub = null;
let myName = localStorage.getItem(MY_KEY) || null;
let fireUser = null;

export function initBatalha(container, animes) {
  console.log("[Batalha] Init. PEOPLE:", PEOPLE);

  onAuthStateChanged(auth, (user) => {
    fireUser = user;
    if (!user) {
      renderAuthGate(container, animes);
    } else {
      // Recupera nome ligado a este uid (mesmo sistema do suggest.js)
      const linked = localStorage.getItem(`user-${user.uid}-personName`);
      if (linked && !myName) myName = linked;
      renderRoot(container, animes);
    }
  });
}

function renderAuthGate(container, animes) {
  container.innerHTML = `
    <div class="bt-auth-gate">
      <div class="bt-auth-icon">🔐</div>
      <h3>Login necessário</h3>
      <p>Para jogar a Batalha, faça login com Google — o mesmo que você usa para votar nos animes.</p>
      <button class="batalha-action-btn" id="bt-login-btn">Entrar com Google</button>
    </div>
  `;
  document.getElementById("bt-login-btn")?.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      // onAuthStateChanged vai reagir automaticamente
    } catch (e) {
      alert("Erro no login: " + e.message);
    }
  });
}

function renderRoot(container, animes) {
  if (unsub) {
    unsub();
    unsub = null;
  }

  // Mostra loading
  container.innerHTML = `<div class="bt-loading">Carregando...</div>`;

  // Escuta sessões ativas que envolvem qualquer membro
  // Query simples sem filtro composto — filtra client-side
  const q = collection(db, SESSIONS_COL);

  unsub = onSnapshot(
    q,
    (snap) => {
      const all = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      const sessions = all.filter((s) => ["waiting", "active", "finished"].includes(s.status));
      console.log(
        "[Batalha] Sessões:",
        sessions.map((s) => `${s.id.slice(0, 6)} ${s.status}`),
      );

      const mySession = myName
        ? sessions.find((s) => s.player1_name === myName || s.player2_name === myName)
        : null;

      if (mySession) {
        console.log(
          `[Batalha] Minha sessão: ${mySession.id} status=${mySession.status} round=${mySession.current_round}`,
        );
        if (mySession.status === "finished") renderFinished(container, mySession);
        else if (mySession.status === "waiting") renderWaiting(container, mySession, animes);
        else renderActive(container, mySession, animes);
      } else {
        renderLobby(
          container,
          animes,
          sessions.filter((s) => s.status === "waiting"),
        );
      }
    },
    (err) => {
      console.error("[Batalha] Erro no listener:", err.code, err.message);
      // Mostra lobby mesmo sem conexão ao Firestore
      renderLobby(container, animes, []);
      // Banner de aviso não-bloqueante
      const warn = document.createElement("div");
      warn.style.cssText =
        "background:rgba(253,230,138,0.08);border:1px solid rgba(253,230,138,0.2);border-radius:12px;color:rgba(253,230,138,0.7);font-size:12px;font-weight:700;margin-top:16px;padding:10px 14px;";
      warn.textContent = `⚠️ Sem sincronização em tempo real (${err.code || "erro"}). A batalha pode não funcionar corretamente.`;
      container.appendChild(warn);
    },
  );
}

// ── Tela 1: Lobby ─────────────────────────────────────────────────────────────

function renderLobby(container, animes, activeSessions) {
  const opponents = PEOPLE.filter((p) => !myName || p !== myName);

  container.innerHTML = `
    <div class="bt-lobby">
      <div class="bt-identity">
        <label class="bt-label">Eu sou</label>
        <div class="bt-person-grid" id="bt-who">
          ${PEOPLE.map(
            (p) => `
            <button class="bt-person-btn ${myName === p ? "active" : ""}" data-name="${p}"
              style="--pc:${PERSON_COLORS[p]};--pl:${PERSON_LIGHTS[p]}">
              <span class="bt-person-dot" style="background:${PERSON_LIGHTS[p]}"></span>
              ${p}
            </button>
          `,
          ).join("")}
        </div>
      </div>

      <div class="bt-create" id="bt-create-section" style="${myName ? "" : "opacity:.4;pointer-events:none"}">
        <label class="bt-label">Criar nova batalha contra</label>
        <div class="bt-create-row">
          <select id="bt-opponent" class="batalha-select">
            <option value="">Selecionar oponente...</option>
            ${PEOPLE.filter((p) => p !== myName)
              .map(
                (p) => `
              <option value="${p}">${p}</option>
            `,
              )
              .join("")}
          </select>
          <button class="batalha-action-btn" id="bt-create-btn">Criar batalha →</button>
        </div>
        <div id="bt-create-error" class="bt-error hidden"></div>
        <div id="bt-create-loading" class="bt-loading-msg hidden">Criando sessão...</div>
      </div>

      ${
        activeSessions.filter((s) => s.player1_name !== myName && s.player2_name !== myName)
          .length > 0
          ? `
        <div class="bt-open-sessions">
          <label class="bt-label">Batalhas abertas para entrar</label>
          <div class="bt-sessions-list">
            ${activeSessions
              .filter((s) => s.status === "waiting" && s.player2_name === myName)
              .map(
                (s) => `
              <div class="bt-session-item">
                <span>${s.player1_name} <em>criou uma batalha para você</em></span>
                <button class="batalha-action-btn" onclick="window.__btJoin('${s.id}')">Entrar →</button>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `
          : ""
      }
    </div>
  `;

  // Selecionar quem sou
  document.getElementById("bt-who").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-name]");
    if (!btn) return;
    myName = btn.dataset.name;
    localStorage.setItem(MY_KEY, myName);
    console.log(`[Batalha] Eu sou: ${myName}`);
    renderLobby(container, animes, activeSessions);
  });

  // Criar batalha
  document.getElementById("bt-create-btn")?.addEventListener("click", async () => {
    const opp = document.getElementById("bt-opponent").value;
    const errEl = document.getElementById("bt-create-error");
    const loadEl = document.getElementById("bt-create-loading");
    const btn = document.getElementById("bt-create-btn");
    errEl.classList.add("hidden");

    if (!myName) {
      errEl.textContent = "Selecione quem você é primeiro.";
      errEl.classList.remove("hidden");
      return;
    }
    if (!opp) {
      errEl.textContent = "Selecione um oponente.";
      errEl.classList.remove("hidden");
      return;
    }
    if (opp === myName) {
      errEl.textContent = "Você não pode batalhar contra si mesmo.";
      errEl.classList.remove("hidden");
      return;
    }

    console.log(`[Batalha] Tentando criar: ${myName} vs ${opp}`);
    btn.disabled = true;
    loadEl.classList.remove("hidden");

    try {
      await createSession(animes, myName, opp);
      // onSnapshot vai reagir automaticamente
    } catch (e) {
      console.error("[Batalha] Erro ao criar:", e);
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
      btn.disabled = false;
      loadEl.classList.add("hidden");
    }
  });

  // Entrar em sessão
  window.__btJoin = async (sessionId) => {
    try {
      await joinSession(sessionId);
    } catch (e) {
      alert(e.message);
    }
  };
}

// ── Tela 2: Waiting ───────────────────────────────────────────────────────────

function renderWaiting(container, session, animes) {
  const c1 = PERSON_LIGHTS[session.player1_name] || "#a78bfa";
  const c2 = PERSON_LIGHTS[session.player2_name] || "#f9a8d4";
  const isP1 = myName === session.player1_name;
  const isP2 = myName === session.player2_name;

  container.innerHTML = `
    <div class="bt-waiting">
      <div class="bt-waiting-header">
        <span class="bt-player-badge" style="color:${c1};border-color:${PERSON_COLORS[session.player1_name]}55">
          ${session.player1_name} ✓
        </span>
        <span class="bt-vs-tag">vs</span>
        <span class="bt-player-badge ${session.player2_ready ? "ready" : "pending"}"
          style="color:${c2};border-color:${PERSON_COLORS[session.player2_name]}55">
          ${session.player2_name} ${session.player2_ready ? "✓" : "⏳"}
        </span>
      </div>

      <p class="bt-waiting-msg">
        ${session.player2_ready ? "Ambos prontos! Iniciando..." : `Aguardando <strong style="color:${c2}">${session.player2_name}</strong> entrar na batalha...`}
      </p>

      ${
        !isP2 && !session.player2_ready
          ? ""
          : !session.player2_ready
            ? `
        <button class="batalha-action-btn" id="bt-join-btn">
          Entrar como ${session.player2_name} →
        </button>
      `
            : ""
      }

      <div class="bt-waiting-info">
        <span>5 rodadas · ${session.rounds?.length || 0} pares de animes sorteados</span>
      </div>

      <button class="batalha-cancel-btn" id="bt-cancel">Cancelar batalha</button>
    </div>
  `;

  document.getElementById("bt-join-btn")?.addEventListener("click", async () => {
    // Qualquer pessoa pode entrar como p2 se não tiver nome selecionado
    if (!myName || myName === session.player2_name) {
      myName = session.player2_name;
      localStorage.setItem(MY_KEY, myName);
    }
    try {
      await joinSession(session.id);
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById("bt-cancel")?.addEventListener("click", async () => {
    if (confirm("Cancelar a batalha?")) await cancelSession(session.id);
  });
}

// ── Tela 3: Active ────────────────────────────────────────────────────────────

async function renderActive(container, session, animes) {
  const round = session.current_round;
  const rd = session.rounds?.[round - 1];
  if (!rd) return;

  const c1 = PERSON_LIGHTS[session.player1_name] || "#a78bfa";
  const c2 = PERSON_LIGHTS[session.player2_name] || "#f9a8d4";

  // Pega votos desta rodada (filtra client-side para evitar índices compostos)
  const allVotesSnap = await getDocs(
    query(collection(db, VOTES_COL), where("session_id", "==", session.id)),
  );
  const votesSnap = { docs: allVotesSnap.docs.filter((d) => d.data().round === round) };
  const votes = {};
  votesSnap.docs.forEach((v) => {
    const d = v.data();
    votes[d.player_name] = d.anime_id;
  });
  const myVote = myName ? votes[myName] : null;
  const votedNames = Object.keys(votes);

  console.log(`[Batalha] Rodada ${round} votos:`, votes, "Meu voto:", myVote);

  container.innerHTML = `
    <div class="bt-active">
      <!-- Header -->
      <div class="bt-active-header">
        <div class="bt-scoreboard">
          <div class="bt-scorer">
            <span class="bt-scorer-name" style="color:${c1}">${session.player1_name}</span>
          </div>
          <div class="bt-round-indicator">
            <span>Rodada</span>
            <strong>${round}/${ROUNDS_TOTAL}</strong>
          </div>
          <div class="bt-scorer">
            <span class="bt-scorer-name" style="color:${c2}">${session.player2_name}</span>
          </div>
        </div>

        <div class="bt-pips">
          ${Array.from({ length: ROUNDS_TOTAL }, (_, i) => {
            const res = session.round_results?.[i];
            const st = i < round - 1 ? "done" : i === round - 1 ? "active" : "pending";
            return `<div class="bpip bpip-${st}" title="Rodada ${i + 1}">
              ${res?.winner === myName ? "✓" : res && res.winner !== myName && res.winner !== null ? "✗" : i + 1}
            </div>`;
          }).join("")}
        </div>
      </div>

      <!-- Arena -->
      <div class="bt-arena">
        ${[
          { anime: rd.animeA, key: "A" },
          { anime: rd.animeB, key: "B" },
        ]
          .map(({ anime, key }) => {
            const chosen = myVote === anime.id;
            const disabled = !!myVote;
            return `
            <div class="bcard2 ${chosen ? "bcard2-chosen" : ""}">
              <div class="bcard2-nota">${formatNota(anime.nota)}</div>
              <div class="bcard2-name">${escapeHTML(anime.nome)}</div>
              <button class="bvote2 ${disabled ? "bvote2-done" : ""}"
                data-id="${anime.id}" ${disabled ? "disabled" : ""}>
                ${chosen ? "✓ Seu voto" : disabled ? "—" : "Votar"}
              </button>
            </div>
          `;
          })
          .join(`<div class="bt-vs-center">VS</div>`)}
      </div>

      <!-- Status -->
      <div class="bt-vote-status">
        ${
          myVote
            ? `<div class="bt-voted-msg">Você votou! ${votedNames.length < 2 ? "Aguardando o outro jogador..." : "Resolvendo..."}</div>`
            : `<div class="bt-your-turn" style="color:${PERSON_LIGHTS[myName] || "#fff"}">Sua vez de votar, ${myName || "jogador"}!</div>`
        }
        <div class="bt-voter-badges">
          ${[session.player1_name, session.player2_name]
            .map(
              (p) => `
            <span class="bt-voter-badge ${votes[p] ? "voted" : ""}"
              style="border-color:${PERSON_COLORS[p]}55;color:${votes[p] ? PERSON_LIGHTS[p] : "var(--muted)"}">
              ${p[0]} ${votes[p] ? "✓" : "…"}
            </span>
          `,
            )
            .join("")}
        </div>
      </div>

      <!-- Últimas rodadas -->
      ${
        session.round_results?.length
          ? `
        <div class="bt-history">
          ${session.round_results
            .slice()
            .reverse()
            .map(
              (r) => `
            <div class="bt-hist-row">
              <span class="bt-hist-num">R${r.round}</span>
              <span class="bt-hist-anime">${escapeHTML(r.winnerAnime || "Empate")}</span>
              <span class="bt-hist-winner" style="color:${r.winner ? PERSON_LIGHTS[r.winner] : "var(--muted)"}">
                ${r.winner ? `+1 ${r.winner}` : "empate"}
              </span>
            </div>
          `,
            )
            .join("")}
        </div>
      `
          : ""
      }

      <button class="batalha-cancel-btn" id="bt-cancel">Abandonar</button>
    </div>
  `;

  // Vote buttons — bloqueia tudo imediatamente, deixa onSnapshot atualizar a UI
  document.querySelectorAll(".bvote2:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!myName) {
        alert("Selecione quem você é primeiro.");
        return;
      }

      // Bloqueia todos os botões na hora para evitar duplo clique
      document.querySelectorAll(".bvote2").forEach((b) => {
        b.disabled = true;
        b.classList.add("bvote2-done");
        b.textContent = b === btn ? "✓ Seu voto" : "—";
      });

      // Atualiza status otimisticamente (sem re-render completo)
      const statusEl = document.querySelector(".bt-vote-status");
      if (statusEl)
        statusEl.innerHTML = `<div class="bt-voted-msg">✓ Voto registrado! Aguardando o outro jogador...</div>`;

      try {
        await castVote(session.id, round, myName, btn.dataset.id);
        // NÃO chama renderActive aqui — o onSnapshot vai atualizar quando o round avançar
        console.log("[Batalha] Voto registrado, aguardando onSnapshot...");
      } catch (e) {
        console.error("[Batalha] Erro ao votar:", e);
        if (e.message !== "Você já votou nesta rodada") {
          alert(e.message);
        }
      }
    });
  });

  document.getElementById("bt-cancel")?.addEventListener("click", async () => {
    if (confirm("Abandonar a batalha?")) {
      await cancelSession(session.id);
      myName = null;
      localStorage.removeItem(MY_KEY);
    }
  });

  // Verifica se a sessão está finished (pode ter mudado entre o listener e o render)
  if (session.status === "finished") {
    renderFinished(container, session);
  }
}

// ── Tela 4: Finished ──────────────────────────────────────────────────────────

function renderFinished(container, session) {
  const c1 = PERSON_LIGHTS[session.player1_name] || "#a78bfa";
  const c2 = PERSON_LIGHTS[session.player2_name] || "#f9a8d4";

  const agreed_total = (session.round_results || []).filter((r) => {
    const v = r.votes || {};
    return v[session.player1_name] && v[session.player1_name] === v[session.player2_name];
  }).length;

  container.innerHTML = `
    <div class="bt-reveal">

      <div class="bt-reveal-header">
        <div class="bt-reveal-players">
          <div class="bt-reveal-player" style="--pc:${PERSON_COLORS[session.player1_name]};--pl:${c1}">
            <div class="bt-reveal-avatar">${session.player1_name[0]}</div>
            <span>${session.player1_name}</span>
          </div>
          <div class="bt-reveal-title-block">
            <div class="bt-reveal-emoji">🎭</div>
            <h2>Reveal</h2>
            ${agreed_total > 0 ? `<div class="bt-reveal-agree-badge">🤝 ${agreed_total} escolha${agreed_total > 1 ? "s" : ""} igual${agreed_total > 1 ? "is" : ""}!</div>` : ""}
          </div>
          <div class="bt-reveal-player" style="--pc:${PERSON_COLORS[session.player2_name]};--pl:${c2}">
            <div class="bt-reveal-avatar">${session.player2_name[0]}</div>
            <span>${session.player2_name}</span>
          </div>
        </div>
      </div>

      <div class="bt-reveal-cards">
        ${(session.round_results || [])
          .map((r) => {
            const rd = session.rounds?.[r.round - 1];
            const v = r.votes || {};
            const p1id = v[session.player1_name];
            const p2id = v[session.player2_name];
            const p1nome = p1id === rd?.animeA?.id ? rd.animeA.nome : rd?.animeB?.nome;
            const p2nome = p2id === rd?.animeA?.id ? rd.animeA.nome : rd?.animeB?.nome;
            const same = p1id && p1id === p2id;

            return `
            <div class="bt-reveal-card ${same ? "bt-reveal-card-same" : ""}">
              <div class="bt-reveal-card-num">Rodada ${r.round}</div>

              <div class="bt-reveal-card-options">
                <span class="${p1id === rd?.animeA?.id || p2id === rd?.animeA?.id ? "bt-opt-picked" : "bt-opt-skipped"}">${escapeHTML(rd?.animeA?.nome || "")}</span>
                <span class="bt-opt-vs">vs</span>
                <span class="${p1id === rd?.animeB?.id || p2id === rd?.animeB?.id ? "bt-opt-picked" : "bt-opt-skipped"}">${escapeHTML(rd?.animeB?.nome || "")}</span>
              </div>

              <div class="bt-reveal-card-votes">
                <div class="bt-rvc" style="--pl:${c1};--pc:${PERSON_COLORS[session.player1_name]}">
                  <div class="bt-rvc-dot"></div>
                  <div class="bt-rvc-info">
                    <span class="bt-rvc-name">${session.player1_name}</span>
                    <span class="bt-rvc-choice">${escapeHTML(p1nome || "—")}</span>
                  </div>
                </div>

                ${same ? `<div class="bt-rvc-same">🤝</div>` : `<div class="bt-rvc-diff">⚡</div>`}

                <div class="bt-rvc" style="--pl:${c2};--pc:${PERSON_COLORS[session.player2_name]}">
                  <div class="bt-rvc-info" style="text-align:right">
                    <span class="bt-rvc-name">${session.player2_name}</span>
                    <span class="bt-rvc-choice">${escapeHTML(p2nome || "—")}</span>
                  </div>
                  <div class="bt-rvc-dot"></div>
                </div>
              </div>

              ${same ? `<div class="bt-rvc-same-label">Mesma escolha!</div>` : ""}
            </div>
          `;
          })
          .join("")}
      </div>

      <button class="batalha-action-btn" id="bt-rematch">Nova batalha →</button>
    </div>
  `;

  document.getElementById("bt-rematch")?.addEventListener("click", async () => {
    await cancelSession(session.id).catch(() => {});
    myName = null;
    localStorage.removeItem(MY_KEY);
    // O listener vai detectar que a sessão sumiu e mostrar o lobby
  });
}
