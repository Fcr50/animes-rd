// js/historico.js
import { supabase } from './supabase-client.js';
import { getGroupId, escapeHTML } from './utils.js';

const container = document.getElementById("historico-container");

let currentUser = null;
let currentGroupId = null;
let members = [];

async function init() {
  currentGroupId = getGroupId();
  if (!currentGroupId) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    container.innerHTML = `<p style="text-align:center;padding:40px;color:var(--faint)">Faça login para ver seu histórico.</p>`;
    return;
  }
  currentUser = user;

  const { data: m } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', currentGroupId);
  members = m;

  await loadHistory();
}

async function loadHistory() {
  // CORREÇÃO: Agora buscamos de group_animes para conseguir o relacionamento com votes
  const { data: votedItems, error } = await supabase
    .from('group_animes')
    .select(`
      status,
      mal_id,
      animes (name, genres, image_url),
      votes!inner(user_id, score, comment)
    `)
    .eq('group_id', currentGroupId)
    .eq('votes.user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Erro no histórico:", error);
    container.innerHTML = `<p>Erro ao carregar histórico: ${error.message}</p>`;
    return;
  }

  // Mapeia para o formato que a função renderList espera
  const processedAnimes = votedItems.map(item => ({
    ...item.animes,
    id: item.mal_id,
    mal_id: item.mal_id,
    votes: item.votes
  }));

  const animeIds = processedAnimes.map(a => a.mal_id);
  const { data: allVotes } = await supabase
    .from('votes')
    .select('mal_id, user_id, score, comment')
    .eq('group_id', currentGroupId)
    .in('mal_id', animeIds);

  renderList(processedAnimes, allVotes);
}

function renderList(animes, allVotes) {
  if (!animes.length) {
    container.innerHTML = `
      <div style="text-align:center; padding:60px; color:var(--muted)">
        <div style="font-size:48px; margin-bottom:16px">📭</div>
        <p style="font-size:16px; font-weight:700; color:var(--paper)">Nenhum voto ainda</p>
        <a href="pending.html#g=${currentGroupId}" style="color:var(--accent); font-weight:800; margin-top:16px; display:inline-block">← Ir para a fila</a>
      </div>`;
    return;
  }

  const myMember = members.find(m => m.user_id === currentUser.id);

  container.innerHTML = `
    <div style="margin-bottom:20px; color:var(--muted); font-size:14px">
      ${animes.length} animes votados por <strong style="color:${myMember?.color}">${myMember?.nickname}</strong>
    </div>
    <div id="pending-animes-container">
      ${animes.map(anime => {
        const animeVotes = allVotes.filter(v => v.mal_id === anime.mal_id);
        const myVote = animeVotes.find(v => v.user_id === currentUser.id);
        
        const dots = members.map(m => {
          const hasVoted = animeVotes.some(v => v.user_id === m.user_id);
          const c = m.color || "#ccc";
          return `<span title="${m.nickname}"
            style="display:inline-flex;width:22px;height:22px;border-radius:50%;
                   align-items:center;justify-content:center;font-size:11px;font-weight:bold;
                   margin-right:4px;border:1px solid ${hasVoted ? c : "rgba(255,255,255,0.1)"};
                   background:${hasVoted ? c + '22' : "transparent"};color:${hasVoted ? c : "rgba(255,255,255,0.2)"}">${m.nickname[0].toUpperCase()}</span>`;
        }).join("");

        return `
          <div class="vote-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <h3 style="margin:0">${escapeHTML(anime.name)}</h3>
              <div style="display:flex">${dots}</div>
            </div>
            <div style="margin-top:15px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:14px">
              <div style="font-weight:800; color:var(--accent); font-size:14px; margin-bottom:8px">
                ✓ Meu voto: ${myVote?.score !== null ? Number(myVote?.score).toFixed(1) : "Não assisti"}
              </div>
              ${myVote?.comment ? `<div style="font-style:italic; font-size:13px; color:var(--muted)">"${escapeHTML(myVote.comment)}"</div>` : ""}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

init();
