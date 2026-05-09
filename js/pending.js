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
    .eq('group_id', currentGroupId)
    .eq('status', 'pending');

  if (error) { console.error(error); return; }
  renderList(list || []);
}

function getSubmitterName(userId) {
  const m = members.find(m => m.user_id === userId);
  return m ? m.nickname : null;
}

function getUserColor() {
  const me = members.find(m => m.user_id === currentUser?.id);
  return me?.color || '#2a9db4';
}

function renderList(list) {
  if (!list.length) {
    pendingAnimesContainer.innerHTML = `
      <div style="text-align:center; padding:80px 20px;">
        <div style="font-size:48px; margin-bottom:16px">✅</div>
        <p style="font-size:18px; font-weight:800; color:#86efac; margin:0">Você votou em todos!</p>
        <p style="color:rgba(134,239,172,0.55); font-size:14px; margin-top:8px">Nenhum anime aguardando votação.</p>
        <a href="historico.html" class="pending-history-btn" style="margin-top:20px; display:inline-block;">Ver histórico →</a>
      </div>`;
    return;
  }

  pendingAnimesContainer.innerHTML = list.map(item => {
    const anime = item.animes || {};
    const votes = item.votes || [];
    const myVote = votes.find(v => v.user_id === currentUser?.id);
    const hasVoted = !!myVote;
    const submitterName = item.added_by ? getSubmitterName(item.added_by) : null;
    const submitterColor = submitterName ? (members.find(m => m.nickname === submitterName)?.color || '#86efac') : '#86efac';
    const genres = (anime.genres || []);
    const links = normalizeLinks(item.links);

    const dots = members.map(m => {
      const voted = votes.some(v => v.user_id === m.user_id);
      const color = m.color || "#888";
      return `<span title="${m.nickname}: ${voted ? 'Votou' : 'Pendente'}"
        style="display:inline-flex;width:24px;height:24px;border-radius:50%;align-items:center;justify-content:center;font-size:10px;font-weight:bold;margin-right:4px;border:2px solid ${voted ? color : 'rgba(255,255,255,0.1)'};background:${voted ? color + '22' : 'transparent'};color:${voted ? color : 'rgba(255,255,255,0.2)'}"
      >${m.nickname[0].toUpperCase()}</span>`;
    }).join("");

    const genreChips = genres.map(g => `<span class="pending-genre-chip">${escapeHTML(g)}</span>`).join("");

    const linkChips = links.map((l, i) => `
      <div class="pending-link-chip-wrap">
        <a href="${escapeHTML(l.url)}" target="_blank" rel="noopener" class="pending-link-chip">${escapeHTML(l.name)}</a>
      </div>`).join("");

    const voteStatus = hasVoted
      ? `<div class="vote-done-badge">✓ Votado: ${myVote.score !== null ? Number(myVote.score).toFixed(1) : 'Não assisti'}</div>`
      : `<button class="vote-now-btn" onclick="window.toggleVotePanel('${item.mal_id}')">Votar Agora</button>`;

    return `
      <div class="vote-card" id="card-${item.mal_id}">
        <div class="vote-card-header">
          <img src="${escapeHTML(anime.image_url || '')}" class="vote-card-img" alt="${escapeHTML(anime.name || '')}" onerror="this.style.display='none'">
          <div class="vote-card-info">
            <div class="vote-card-top">
              <h3>${escapeHTML(anime.name || '')}</h3>
              <div style="display:flex; flex-shrink:0">${dots}</div>
            </div>
            <div class="pending-genres">${genreChips}</div>
            ${submitterName ? `<p class="vote-card-submitter">Sugerido por <strong style="color:${submitterColor}">${escapeHTML(submitterName)}</strong></p>` : ''}
            ${linkChips ? `<div class="vote-card-links">${linkChips}</div>` : ''}
            <div class="vote-card-actions">${voteStatus}</div>
          </div>
        </div>

        <div class="vote-controls" id="controls-${item.mal_id}" style="display:none;">
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
          <button onclick="window.castVoteInline('${item.mal_id}')" style="margin-top:14px; width:100%; background: linear-gradient(135deg, ${getUserColor()}cc, ${getUserColor()}66) !important; border-color: ${getUserColor()}44 !important; box-shadow: 0 4px 18px ${getUserColor()}33 !important;">Confirmar Voto</button>
        </div>
      </div>`;
  }).join('');
}

function normalizeLinks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(l => l && l.url);
  if (typeof raw === 'object') return Object.entries(raw).filter(([, v]) => v).map(([name, url]) => ({ name, url }));
  return [];
}

window.toggleVotePanel = (malId) => {
  const panel = document.getElementById(`controls-${malId}`);
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
};

window.castVoteInline = async (malId) => {
  const watchStatus = document.querySelector(`input[name="watch-${malId}"]:checked`)?.value;
  const score = watchStatus === 'watched' ? parseFloat(document.getElementById(`score-${malId}`)?.value) : null;
  const comment = watchStatus === 'watched' ? (document.getElementById(`comment-${malId}`)?.value || '') : '';

  if (watchStatus === 'watched' && (isNaN(score) || score < 0 || score > 10)) {
    alert("Nota inválida."); return;
  }

  try {
    const { error } = await supabase.from('votes').insert([{
      group_id: currentGroupId,
      mal_id: parseInt(malId),
      user_id: currentUser.id,
      score,
      comment: comment || null
    }]);
    if (error) throw error;

    await supabase.from('user_library').upsert([{
      user_id: currentUser.id,
      mal_id: parseInt(malId),
      last_score: score,
      last_comment: comment || null
    }]);
  } catch (err) {
    alert("Erro ao votar: " + err.message);
  }
};

init();
