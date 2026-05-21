// js/pending.js
import { supabase } from './supabase-client.js';
import { getGroupId, escapeHTML, updatePendingBadge } from './utils.js';

const pendingAnimesContainer = document.getElementById("pending-animes-container");

let currentGroupId = null;
let members = [];
let currentUser = null;

async function init() {
  currentGroupId = getGroupId();
  if (!currentGroupId) return;

  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user;

  const { data: m } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', currentGroupId);
  members = m || [];

  await loadPendingAnimes();

  supabase
    .channel('realtime-pending')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `group_id=eq.${currentGroupId}` }, loadPendingAnimes)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_animes', filter: `group_id=eq.${currentGroupId}` }, loadPendingAnimes)
    .subscribe();
}

async function loadPendingAnimes() {
  if (!currentGroupId) {
    console.warn("loadPendingAnimes cancelado: currentGroupId não definido.");
    renderList([]);
    return;
  }

  const { data: list, error } = await supabase
    .from('group_animes')
    .select(`
      status,
      mal_id,
      links,
      added_by,
      animes (name, genres, image_url),
      votes (user_id, score, comment)
    `)
    .eq('group_id', currentGroupId);

  if (error) {
    return;
  }

  const stillPendingForMe = list.filter(item => {
    const userVotes = item.votes || [];
    return !userVotes.some(v => v.user_id === currentUser.id);
  });

  renderList(stillPendingForMe);
}


function getSubmitterName(userId) {
  const m = members.find(m => m.user_id === userId);
  return m ? m.nickname : null;
}


function renderList(list) {
  if (!list.length) {
    pendingAnimesContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 80px 20px;">
        <div style="font-size: 52px; margin-bottom: 20px;">✅</div>
        <p style="font-size: 20px; font-weight: 800; color: #4ade80; margin: 0 0 8px;">Você está em dia!</p>
        <p style="color: rgba(134,239,172,0.5); font-size: 14px; margin: 0 0 28px;">Nenhum anime aguardando sua avaliação.</p>
      </div>`;
    return;
  }

  pendingAnimesContainer.innerHTML = list.map(item => {
    const anime = item.animes || {};
    const votes = item.votes || [];
    
    const voteStatusHTML = `
      <a href="https://myanimelist.net/anime/${item.mal_id}" target="_blank" class="mal-link">Ver no MAL</a>
      <button class="vote-now-btn" onclick="window.toggleVotePanel('${item.mal_id}', this)">Votar Agora</button>
    `;

    return `
      <div class="vote-card" id="card-${item.mal_id}">
        <!-- ... (cabeçalho do card, igual ao anterior) ... -->
        <div class="vote-card-header">
            <img src="${escapeHTML(anime.image_url || '')}" class="vote-card-img" alt="${escapeHTML(anime.name || '')}" onerror="this.style.display='none'">
            <div class="vote-card-info">
              <div class="vote-card-top">
                <h3>${escapeHTML(anime.name || '')}</h3>
              </div>
              <div class="vote-card-actions">${voteStatusHTML}</div>
            </div>
        </div>

        <div class="vote-controls" id="controls-${item.mal_id}" style="display:none;">
          <div class="modal-header" style="margin-bottom:20px; padding:0; border:0;">
             <h2 style="font-size:18px; margin:0; font-family:'Newsreader',serif;">Seu voto para ${escapeHTML(anime.name || '')}</h2>
             <button class="modal-close" id="close-vote-panel-${item.mal_id}" onclick="window.toggleVotePanel('${item.mal_id}')">✕</button>
          </div>
          <div style="display:flex; gap:20px; margin-bottom:14px;">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; color:rgba(224,247,250,0.8);">
              <input type="radio" name="watch-${item.mal_id}" value="watched" checked
                onchange="document.getElementById('score-wrap-${item.mal_id}').style.display='block'"> Assisti
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:13px; color:rgba(224,247,250,0.8);">
              <input type="radio" name="watch-${item.mal_id}" value="not-watched"
                onchange="document.getElementById('score-wrap-${item.mal_id}').style.display='none'"> Não assisti
            </label>
          </div>
          <div id="score-wrap-${item.mal_id}">
            <div style="display:flex; justify-content:space-between; font-size:12px; color:rgba(224,247,250,0.7); margin-bottom:4px;">
              <span>Nota</span><span id="score-val-${item.mal_id}">5.0</span>
            </div>
            <input type="range" id="score-${item.mal_id}" min="0" max="10" step="0.1" value="5.0"
              oninput="document.getElementById('score-val-${item.mal_id}').textContent=parseFloat(this.value).toFixed(1)"
              style="width:100%; margin-bottom:12px; accent-color:#7dd3de;">
            <textarea id="comment-${item.mal_id}" placeholder="Comentário (opcional)"
              style="width:100%; background:rgba(0,0,0,0.4); border:1px solid rgba(26,107,120,0.3); border-radius:12px; color:#e0f7fa; font-size:13px; padding:10px 14px; resize:vertical; min-height:70px; font-family:inherit; outline:none;"></textarea>
          </div>
          <button onclick="window.castVoteInline('${item.mal_id}')" style="margin-top:14px; width:100%;">Confirmar Voto</button>
        </div>
      </div>`;
  }).join('');
}


window.toggleVotePanel = (malId, voteBtn) => {
  const panel = document.getElementById(`controls-${malId}`);
  if (!panel) return;

  const isOpen = panel.style.display === 'block';
  panel.style.display = isOpen ? 'none' : 'block';

  // Trava o modal ao abrir
  if (!isOpen) {
    if (voteBtn) voteBtn.style.display = 'none'; // Esconde o "Votar Agora"
    const closeBtn = document.getElementById(`close-vote-panel-${malId}`);
    if (closeBtn) closeBtn.style.display = 'none'; // Esconde o "X"
  } else {
    // Garante que o botão "Votar agora" reapareça se o usuário fechar de alguma forma
     const cardActions = document.querySelector(`#card-${malId} .vote-card-actions`);
     if (cardActions && !cardActions.querySelector('.vote-now-btn')) {
       cardActions.innerHTML = `<button class="vote-now-btn" onclick="window.toggleVotePanel('${malId}', this)">Votar Agora</button>`;
     }
  }
};

window.castVoteInline = async (malId) => {
  const btn = document.querySelector(`#controls-${malId} button[onclick*="castVoteInline"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  const watchStatus = document.querySelector(`input[name="watch-${malId}"]:checked`)?.value;
  const score = watchStatus === 'watched' ? parseFloat(document.getElementById(`score-${malId}`)?.value) : null;
  const comment = watchStatus === 'watched' ? (document.getElementById(`comment-${malId}`)?.value || '') : '';
  
  try {
    const { error: voteError } = await supabase.from('votes').insert([{
      group_id: currentGroupId,
      mal_id: parseInt(malId),
      user_id: currentUser.id,
      score,
      comment: comment || null
    }]);
    if (voteError) throw voteError;

    // Apenas atualiza a user_library se o usuário assistiu e deu nota
    if (score !== null) {
      await supabase.from('user_library').upsert([{ 
        user_id: currentUser.id, 
        mal_id: parseInt(malId), 
        last_score: score, 
        last_comment: comment || null 
      }]);
    }
    
    // Feedback visual imediato
    const cardElement = document.getElementById(`card-${malId}`);
    if (cardElement) {
      cardElement.style.transition = 'opacity 0.4s ease, transform 0.4s ease, height 0.4s ease';
      cardElement.style.opacity = '0';
      cardElement.style.transform = 'scale(0.95)';
      setTimeout(() => {
        cardElement.remove();
        // Se o container ficar vazio, renderiza a mensagem de "tudo votado"
        if (pendingAnimesContainer.children.length === 0) {
            renderList([]);
        }
      }, 400);
    }

    // Atualiza a bolinha vermelha da navbar em tempo real
    updatePendingBadge(currentUser, currentGroupId);
    
  } catch (err) {
    alert("Erro ao votar: " + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar Voto'; }
    
    // Libera o botão de fechar em caso de erro
    const closeBtn = document.getElementById(`close-vote-panel-${malId}`);
    if (closeBtn) closeBtn.style.display = 'block';
  }
};

init();
