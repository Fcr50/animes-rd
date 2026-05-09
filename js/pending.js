// js/pending.js
import { supabase } from './supabase-client.js';
import { getGroupId, escapeHTML } from './utils.js';

const pendingAnimesContainer = document.getElementById("pending-animes-container");

let currentGroupId = null;
let members = [];
let currentUser = null;

async function init() {
  currentGroupId = getGroupId();
  if (!currentGroupId) return;

  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user;

  // Carrega membros para saber quem falta votar
  const { data: m } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', currentGroupId);
  members = m;

  await loadPendingAnimes();

  // Inscrição em tempo real (Escuta mudanças em votos e instâncias)
  supabase
    .channel('realtime-pending')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `group_id=eq.${currentGroupId}` }, loadPendingAnimes)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_animes', filter: `group_id=eq.${currentGroupId}` }, loadPendingAnimes)
    .subscribe();
}

async function loadPendingAnimes() {
  const { data: list, error } = await supabase
    .from('group_animes')
    .select(`
      status,
      mal_id,
      animes!inner (name, genres, image_url),
      votes (user_id, score, comment)
    `)
    .eq('group_id', currentGroupId)
    .eq('status', 'pending');

  if (error) {
    return;
  }

  // FILTRO: Remove da fila os animes que o usuário atual já votou
  const stillPendingForMe = list.filter(item => {
    const userVotes = item.votes || [];
    return !userVotes.some(v => v.user_id === currentUser.id);
  });

  renderList(stillPendingForMe);
}
}

function renderList(list) {
  if (!list.length) {
    pendingAnimesContainer.innerHTML = '<p style="text-align: center; color: var(--faint); padding: 40px;">Nenhum anime na fila de aprovação.</p>';
    return;
  }

  pendingAnimesContainer.innerHTML = list.map(item => {
    const anime = item.animes;
    const votes = item.votes || [];
    const hasVoted = votes.some(v => v.user_id === currentUser.id);

    // Bolinhas de progresso
    const dots = members.map(m => {
      const voted = votes.some(v => v.user_id === m.user_id);
      const color = m.color || "#888";
      return `
        <span title="${m.nickname}: ${voted ? 'Votou' : 'Pendente'}" 
              style="display:inline-flex; width:24px; height:24px; border-radius:50%; align-items:center; justify-content:center; font-size:10px; font-weight:bold; margin-right:5px; border: 2px solid ${voted ? color : 'rgba(255,255,255,0.1)'}; background: ${voted ? color + '22' : 'transparent'}; color: ${voted ? color : 'rgba(255,255,255,0.2)'}">
          ${m.nickname[0].toUpperCase()}
        </span>
      `;
    }).join("");

    return `
      <div class="card pending-card" style="display: flex; gap: 20px; align-items: flex-start;">
        <img src="${anime.image_url}" style="width: 80px; border-radius: 8px;">
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <h3 style="margin: 0;">${escapeHTML(anime.name)}</h3>
            <div style="display: flex;">${dots}</div>
          </div>
          <p style="font-size: 12px; color: var(--faint); margin: 8px 0;">${(anime.genres || []).join(", ")}</p>
          
          ${hasVoted ? 
            `<p style="color: var(--accent); font-size: 13px; font-weight: bold;">✓ Você já votou</p>` :
            `<button class="btn btn-primary" style="padding: 6px 15px; font-size: 12px;" onclick="window.openVoteModal('${item.mal_id}', '${escapeHTML(anime.name)}')">Votar Agora</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

// Modal de Voto (Global para ser chamado via onclick)
window.openVoteModal = function(malId, name) {
  const score = prompt(`Qual sua nota para "${name}"? (0 a 10)`);
  if (score === null) return;
  
  const numScore = parseFloat(score);
  if (isNaN(numScore) || numScore < 0 || numScore > 10) {
    alert("Por favor, digite uma nota válida entre 0 e 10.");
    return;
  }

  const comment = prompt("Algum comentário? (Opcional)");
  castVote(malId, numScore, comment);
};

async function castVote(malId, score, comment) {
  try {
    const { error } = await supabase
      .from('votes')
      .insert([{
        group_id: currentGroupId,
        mal_id: parseInt(malId),
        user_id: currentUser.id,
        score: score,
        comment: comment || null
      }]);

    if (error) throw error;
    
    // Atualizar Biblioteca Pessoal do usuário também
    await supabase.from('user_library').upsert([{
      user_id: currentUser.id,
      mal_id: parseInt(malId),
      last_score: score,
      last_comment: comment
    }]);

    alert("Voto registrado!");
  } catch (err) {
    alert("Erro ao votar: " + err.message);
  }
}

init();
