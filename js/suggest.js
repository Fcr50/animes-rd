// js/suggest.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, updateDoc, serverTimestamp, deleteDoc, runTransaction, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";
import { PEOPLE, PERSON_COLORS, PERSON_LIGHTS, personKey, getPersonNota, formatNota, notaColor } from "./data.js";

// Inicializa Firebase App e Auth apenas se as chaves foram preenchidas
const isFirebaseConfigured = firebaseConfig.apiKey !== "SUA_API_KEY";
let app, auth, db;
let currentUser = null; // Guarda as informações do usuário logado

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

const pendingAnimesRef = isFirebaseConfigured ? collection(db, "pending_animes") : null;

// --- Elementos do DOM ---
const submissionFormContainer = document.getElementById("submission-form-container");
const pendingAnimesContainer = document.getElementById("pending-animes-container");
const userNavContainer = document.getElementById("user-nav");

// --- Funções de UI ---

function renderLoginLogoutButton() {
  if (!isFirebaseConfigured) {
    userNavContainer.innerHTML = "<p style='color: var(--faint);'>Firebase não configurado.</p>";
    return;
  }

  if (currentUser) {
    userNavContainer.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px">
        <a href="#" id="user-profile-link" style="display:flex; align-items:center; gap:8px; text-decoration:none; color:inherit">
          <span class="nav-avatar" style="background: ${PERSON_LIGHTS[currentUser.personName] || 'rgba(255,255,255,0.1)'}; color: ${PERSON_COLORS[currentUser.personName] || '#fff'}; width:24px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-size:12px; font-weight:bold">
            ${currentUser.personName ? currentUser.personName[0] : '?'}
          </span>
          <span style="font-size:14px">${currentUser.personName || 'Selecionar Nome'}</span>
        </a>
        <button id="logout-button" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Sair</button>
      </div>
    `;
    document.getElementById("logout-button").addEventListener("click", handleLogout);

    // Só permite selecionar/mudar o nome se personName NÃO estiver definido
    if (!currentUser.personName) {
      document.getElementById("user-profile-link").addEventListener("click", (e) => {
        e.preventDefault();
        showUserSelectionModal();
      });
    } else {
        // Se o nome já está definido, o clique não faz nada (apenas o link normal)
        document.getElementById("user-profile-link").addEventListener("click", (e) => {
            e.preventDefault(); // Evita que a página role para o topo
        });
    }
  } else {
    userNavContainer.innerHTML = "<button id='login-button' style='padding: 6px 12px; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer;'>Login com Google</button>";
    document.getElementById("login-button").addEventListener("click", handleLogin);
  }
}

function showUserSelectionModal() {
    const overlay = document.createElement('div');
    overlay.id = 'user-selection-overlay';
    overlay.style = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:1000;';
    
    const modal = document.createElement('div');
    modal.style = 'background:var(--card-bg); padding:30px; border-radius:12px; max-width:400px; width:90%; border:1px solid var(--border)';
    
    let optionsHtml = PEOPLE.map(p => `
        <button class="person-select-btn" data-name="${p}" style="display:block; width:100%; padding:12px; margin-bottom:10px; background:rgba(255,255,255,0.05); color:white; border:1px solid var(--border); border-radius:8px; cursor:pointer; text-align:left; font-size:16px">
            <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${PERSON_COLORS[p]}; margin-right:10px"></span>
            ${p}
        </button>
    `).join('');

    modal.innerHTML = `
        <h3 style="margin-top:0; margin-bottom:20px; color:white">Quem é você?</h3>
        <p style="color:var(--faint); margin-bottom:20px; font-size:14px">Selecione seu nome para associar à sua conta Google.</p>
        ${optionsHtml}
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    modal.querySelectorAll('.person-select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-name');
            associateUserWithPerson(name);
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
  if (!currentUser) {
    submissionFormContainer.innerHTML = `
        <div style="text-align:center; padding:20px; border:1px dashed var(--border); border-radius:8px">
            <p style="color:var(--faint)">Faça login para sugerir novos animes.</p>
            <button onclick="document.getElementById('login-button').click()" style="margin-top:10px; padding:8px 16px; background:var(--accent); color:white; border:none; border-radius:4px; cursor:pointer">Fazer Login</button>
        </div>
    `;
    return;
  }

  if (!currentUser.personName) {
      submissionFormContainer.innerHTML = `
        <div style="text-align:center; padding:20px; border:1px dashed var(--border); border-radius:8px">
            <p style="color:var(--faint)">Você precisa associar seu nome antes de sugerir.</p>
            <button id="select-name-prompt" style="margin-top:10px; padding:8px 16px; background:var(--accent); color:white; border:none; border-radius:4px; cursor:pointer">Selecionar Meu Nome</button>
        </div>
      `;
      document.getElementById("select-name-prompt").addEventListener("click", showUserSelectionModal);
      return;
  }

  submissionFormContainer.innerHTML = `
    <div class="form-group">
      <label for="anime-name">Nome do Anime</label>
      <input type="text" id="anime-name" placeholder="Ex: Death Note" required />
    </div>
    <div class="form-group">
      <label for="anime-genres">Gêneros (separados por vírgula)</label>
      <input type="text" id="anime-genres" placeholder="Ação, Suspense, Sobrenatural" required />
    </div>
    <div class="form-group">
      <label for="anime-submitter">Submetido por</label>
      <input type="text" id="anime-submitter" value="${currentUser.personName}" readonly disabled style="background:rgba(255,255,255,0.05); color:var(--faint)" />
    </div>
    <button id="submit-anime-button" style="width:100%; padding:12px; background:var(--accent); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer">Submeter Anime</button>
  `;

  document.getElementById("submit-anime-button").addEventListener("click", handleSubmitAnime);
}

function renderPendingAnimes(animes) {
  if (!animes || animes.length === 0) {
    pendingAnimesContainer.innerHTML = "<p style='color: var(--faint); text-align:center; padding:40px'>Nenhum anime pendente no momento.</p>";
    return;
  }

  let html = "";
  animes.forEach(anime => {
    const isVotedByCurrentUser = anime.votedUserIds?.includes(currentUser?.uid);
    const userVote = currentUser && currentUser.personName ? anime.votes?.[currentUser.personName] : null;
    const votesCount = anime.votedUserIds?.length || 0;
    
    let votesStatusHtml = PEOPLE.map(p => {
        const hasVoted = anime.votes && anime.votes[p];
        const color = hasVoted ? '#34d399' : 'rgba(255,255,255,0.1)';
        return `<span title="${p}: ${hasVoted ? 'Já votou' : 'Pendente'}" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${color}; margin-right:4px"></span>`;
    }).join('');

    html += `
      <div class="vote-card" style="background:var(--card-bg); border:1px solid var(--border); margin-bottom:20px; border-radius:12px; overflow:hidden">
        <div style="padding:20px">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px">
                <h3 style="margin:0; font-size:20px">${anime.nome}</h3>
                <div style="display:flex">${votesStatusHtml}</div>
            </div>
            <p style="margin:0 0 15px 0; font-size:14px; color:var(--faint)">${(anime.generos || []).join(' • ')}</p>
            <div style="font-size:12px; color:var(--faint); margin-bottom:20px">
                Sugerido por <strong>${anime.submittedByName}</strong> em ${anime.createdAt ? new Date(anime.createdAt.seconds * 1000).toLocaleDateString() : '...'}
            </div>

            ${currentUser ? `
                <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:15px">
                    ${!currentUser.personName ? `
                        <p style="margin:0; text-align:center; font-size:14px">
                            <a href="#" onclick="window.showUserSelectionModal(); return false;" style="color:var(--accent)">Associe seu nome</a> para votar.
                        </p>
                    ` : isVotedByCurrentUser ? `
                        <div style="display:flex; justify-content:space-between; align-items:center">
                            <span style="color:#34d399; font-size:14px">✓ Você já votou</span>
                            <span style="background:rgba(52,211,153,0.1); color:#34d399; padding:2px 8px; border-radius:4px; font-weight:bold">${userVote ? userVote.score.toFixed(1) : '—'}</span>
                        </div>
                        ${userVote && userVote.comment ? `<p style="margin:10px 0 0 0; font-size:13px; font-style:italic; color:var(--faint)">"${userVote.comment}"</p>` : ''}
                        <button onclick="window.handleEditVote('${anime.id}')" style="margin-top:10px; background:none; border:none; color:var(--faint); font-size:12px; text-decoration:underline; cursor:pointer; padding:0">Editar voto</button>
                    ` : `
                        <h4 style="margin:0 0 15px 0; font-size:14px">Seu Voto:</h4>
                        <div class="vote-controls">
                            <div style="display:flex; gap:15px; margin-bottom:15px">
                                <label style="display:flex; align-items:center; gap:5px; font-size:14px; cursor:pointer">
                                    <input type="radio" name="watch-status-${anime.id}" value="watched" checked onchange="document.getElementById('watched-fields-${anime.id}').style.display = 'block'"> Assisti
                                </label>
                                <label style="display:flex; align-items:center; gap:5px; font-size:14px; cursor:pointer">
                                    <input type="radio" name="watch-status-${anime.id}" value="not-watched" onchange="document.getElementById('watched-fields-${anime.id}').style.display = 'none'"> Não assisti
                                </label>
                            </div>
                            
                            <div id="watched-fields-${anime.id}">
                                <div style="display:flex; justify-content:space-between; margin-bottom:5px">
                                    <span style="font-size:12px">Nota: <strong id="score-val-${anime.id}">5.0</strong></span>
                                    <span style="font-size:12px; color:var(--faint)">0 - 10</span>
                                </div>
                                <input type="range" id="score-${anime.id}" min="0" max="10" step="0.1" value="5.0" style="width:100%; margin-bottom:15px" oninput="document.getElementById('score-val-${anime.id}').innerText = parseFloat(this.value).toFixed(1)">
                                <textarea id="comment-${anime.id}" placeholder="Algum comentário sobre o anime? (opcional)" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid var(--border); color:white; padding:10px; border-radius:6px; font-size:14px; margin-bottom:15px; min-height:60px"></textarea>
                            </div>
                            <button onclick="window.handleCastVote('${anime.id}')" style="width:100%; padding:10px; background:var(--accent); border:none; color:white; border-radius:6px; cursor:pointer; font-weight:bold">Confirmar Voto</button>
                        </div>
                    `}
                </div>
            ` : ''}
        </div>
      </div>
    `;
  });

  pendingAnimesContainer.innerHTML = html;
}

// Expondo funções para o escopo global
window.handleCastVote = async (animeId) => {
    if (!currentUser || !currentUser.personName) {
        alert("Faça login e associe seu nome antes de votar.");
        return;
    }

    const watchStatus = document.querySelector(`input[name="watch-status-${animeId}"]:checked`).value;
    const score = watchStatus === 'watched' ? parseFloat(document.getElementById(`score-${animeId}`).value) : null;
    const comment = watchStatus === 'watched' ? document.getElementById(`comment-${animeId}`).value : "";
    
    try {
        const docRef = doc(db, "pending_animes", animeId);
        await runTransaction(db, async (transaction) => {
            const animeDoc = await transaction.get(docRef);
            if (!animeDoc.exists()) throw "Anime não encontrado";
            
            const data = animeDoc.data();
            const votes = data.votes || {};
            const votedUserIds = data.votedUserIds || [];
            
            votes[currentUser.personName] = {
                score,
                comment,
                votedAt: new Date()
            };
            
            if (!votedUserIds.includes(currentUser.uid)) {
                votedUserIds.push(currentUser.uid);
            }
            
            transaction.update(docRef, { votes, votedUserIds });
        });
        alert("Voto registrado!");
    } catch (e) {
        console.error(e);
        alert("Erro ao votar: " + e.message);
    }
};

window.handleEditVote = (animeId) => {
    const anime = lastAnimesData.find(a => a.id === animeId);
    if (!anime) return;
    
    // Força re-render para mostrar controles de voto novamente
    const animeIdx = lastAnimesData.findIndex(a => a.id === animeId);
    const updatedAnime = {...anime, votedUserIds: anime.votedUserIds.filter(id => id !== currentUser.uid)};
    const newAnimes = [...lastAnimesData];
    newAnimes[animeIdx] = updatedAnime;
    renderPendingAnimes(newAnimes);
};

// --- Funções de Firebase ---

async function handleLogin() {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Erro no login:", error);
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
    currentUser = null;
    localStorage.removeItem('current-user-session'); // Opcional
    renderUIForUser(null);
  } catch (error) {
    console.error("Erro no logout:", error);
  }
}

async function processUser(user) {
  const storedPersonName = localStorage.getItem(`user-${user.uid}-personName`);
  currentUser = {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      personName: storedPersonName
  };
  
  if (!storedPersonName) {
      showUserSelectionModal();
  }
}

function renderUIForUser(user) {
  renderLoginLogoutButton();
  renderSubmissionForm();
}

async function handleSubmitAnime() {
  const name = document.getElementById("anime-name").value.trim();
  const genresRaw = document.getElementById("anime-genres").value.trim();

  if (!name || !genresRaw) {
    alert("Preencha todos os campos.");
    return;
  }

  const genres = genresRaw.split(',').map(g => g.trim()).filter(g => g);

  try {
    await addDoc(pendingAnimesRef, {
      nome: name,
      generos: genres,
      submittedBy: currentUser.uid,
      submittedByName: currentUser.personName,
      createdAt: serverTimestamp(),
      votes: {},
      votedUserIds: [],
      status: "pending"
    });

    alert("Anime sugerido!");
    document.getElementById("anime-name").value = "";
    document.getElementById("anime-genres").value = "";
  } catch (error) {
    console.error(error);
    alert("Erro ao sugerir.");
  }
}

// --- Listener para Animes Pendentes ---

let lastAnimesData = [];
function startPendingAnimesListener() {
  if (!db) return;

  const q = query(pendingAnimesRef, orderBy("createdAt", "desc"));

  onSnapshot(q, (snapshot) => {
    const animes = [];
    snapshot.forEach(doc => {
      animes.push({ ...doc.data(), id: doc.id });
    });
    lastAnimesData = animes;
    renderPendingAnimes(animes);
  });
}

// --- Inicialização ---

async function init() {
  if (!isFirebaseConfigured) return;

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await processUser(user);
    } else {
      currentUser = null;
    }
    renderUIForUser(currentUser);
    startPendingAnimesListener();
  });
}

init();
