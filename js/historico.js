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

  const { data: m } = await supabase.from('group_members').select('*').eq('group_id', currentGroupId);
  members = m || [];

  await loadHistory();
  supabase.channel('realtime-history')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `group_id=eq.${currentGroupId}` }, loadHistory)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_animes', filter: `group_id=eq.${currentGroupId}` }, loadHistory)
    .subscribe();
}

async function loadHistory() {
  const { data: votedItems, error } = await supabase
    .from('group_animes')
    .select(`status, mal_id, links, added_by, created_at, animes!inner(name, genres, image_url), votes!inner(user_id, score, comment)`)
    .eq('group_id', currentGroupId).eq('status', 'pending').eq('votes.user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) { container.innerHTML = `<p>Erro ao carregar histórico.</p>`; return; }

  const animeIds = votedItems.map(a => a.mal_id);
  if (animeIds.length === 0) { renderList([], []); return; }

  const { data: allVotes } = await supabase.from('votes').select('mal_id, user_id, score, comment').eq('group_id', currentGroupId).in('mal_id', animeIds);
  renderList(votedItems, allVotes || []);
}

function getSubmitterName(userId) {
  const m = members.find(m => m.user_id === userId);
  return m ? m.nickname : "Desconhecido";
}

function renderList(animes, allVotes) {
    if (!animes.length) {
        container.innerHTML = `<div class="empty-state">
            <div class="empty-icon">📭</div>
            <p class="empty-title">Nenhum voto pendente</p>
            <p class="empty-subtitle">Os animes que você votou aparecem aqui enquanto aguardam os outros membros.</p>
            <a href="pending.html#g=${currentGroupId}" class="pending-history-btn">← Ir para a fila</a>
        </div>`;
        return;
    }

    const myMember = members.find(m => m.user_id === currentUser.id);

    container.innerHTML = `
    <div class="list-header">
      ${animes.length} animes votados por <strong style="color:${myMember?.color}">${myMember?.nickname}</strong>
    </div>
    ${animes.map(item => {
      const anime = item.animes;
      const animeVotes = allVotes.filter(v => v.mal_id === item.mal_id);
      const myVote = animeVotes.find(v => v.user_id === currentUser.id);
      const subName = getSubmitterName(item.added_by);
      const subColor = members.find(m => m.nickname === subName)?.color || "#86efac";
      const links = normalizeLinks(item.links);
      
      const dots = members.map(m => {
        const hasVoted = animeVotes.some(v => v.user_id === m.user_id);
        const c = m.color || "#ccc";
        return `<span title="${m.nickname}" class="member-dot" style="border-color:${hasVoted ? c : 'rgba(255,255,255,0.15)'}; background:${hasVoted ? c + '22' : 'transparent'}; color:${hasVoted ? c : 'rgba(255,255,255,0.2)'}">${m.nickname[0].toUpperCase()}</span>`;
      }).join("");

      const otherVotes = animeVotes.filter(v => v.user_id !== currentUser.id).map(v => {
        const m = members.find(mem => mem.user_id === v.user_id);
        const scoreLabel = v.score !== null ? Number(v.score).toFixed(1) : "Não assisti";
        return `<span class="other-vote-chip">${m?.nickname || '??'}: <strong style="color:${m?.color||'#eee'}">${scoreLabel}</strong></span>`;
      }).join(" ");

      return `
        <div class="history-card">
          <div class="history-card-bg" style="background-image: linear-gradient(to bottom, rgba(18,20,26,0.60) 0%, rgba(18,20,26,0.95) 80%, #12141a 100%), url('${anime.image_url}');"></div>
          <div class="history-card-content">
            
            <div class="card-section-top">
              <div class="card-header">
                <h3>${escapeHTML(anime.name)}</h3>
                <div class="dots-container">${dots}</div>
              </div>
              <div class="card-genres">
                ${(anime.genres || []).map(g => `<span class="pending-genre-chip">${escapeHTML(g)}</span>`).join("")}
              </div>
              <p class="card-submitter">Sugerido por <strong style="color:${subColor}">${escapeHTML(subName)}</strong></p>
            </div>

            <div class="card-section-middle">
              <div class="card-links">
                <div class="links-label">Links</div>
                <div class="links-list" id="links-list-${item.mal_id}">
                  ${links.map(l => `<a href="${escapeHTML(l.url)}" target="_blank" class="pending-link-chip">${escapeHTML(l.name)}</a>`).join("")}
                  <button onclick="window.toggleAddLink(event, '${item.mal_id}')" class="pending-link-chip btn-add-link">+ Link</button>
                </div>
                <div id="add-link-panel-${item.mal_id}" class="add-link-panel">
                   <input type="text" id="new-link-name-${item.mal_id}" placeholder="Nome (ex: Dublado)">
                   <input type="url" id="new-link-url-${item.mal_id}" placeholder="https://...">
                   <div class="panel-actions">
                     <button onclick="window.saveNewLink('${item.mal_id}')" class="btn btn-primary">Salvar</button>
                     <button type="button" onclick="window.toggleAddLink(event, '${item.mal_id}')" class="btn">Cancelar</button>
                   </div>
                </div>
              </div>

              <div class="card-my-vote">
                <div class="my-vote-header">
                  <span class="my-vote-text">✓ Meu voto: ${myVote?.score !== null ? Number(myVote?.score).toFixed(1) : "Não assisti"}</span>
                  <button onclick="window.toggleEditPanel('${item.mal_id}')" class="edit-vote-btn">Editar</button>
                </div>
                ${myVote?.comment ? `<div class="my-vote-comment">"${escapeHTML(myVote.comment)}"</div>` : ""}
                <div id="edit-panel-${item.mal_id}" class="edit-vote-panel">
                  <div class="radio-group">
                    <label><input type="radio" name="edit-watch-${item.mal_id}" value="watched" ${myVote?.score !== null ? 'checked' : ''} onchange="document.getElementById('edit-score-wrap-${item.mal_id}').style.display='block'">Assisti</label>
                    <label><input type="radio" name="edit-watch-${item.mal_id}" value="not-watched" ${myVote?.score === null ? 'checked' : ''} onchange="document.getElementById('edit-score-wrap-${item.mal_id}').style.display='none'">Não assisti</label>
                  </div>
                  <div id="edit-score-wrap-${item.mal_id}" style="${myVote?.score !== null ? '' : 'display:none;'}">
                    <label class="input-label">Nota</label>
                    <input type="number" id="edit-score-${item.mal_id}" min="0" max="10" step="0.1" value="${myVote?.score||'5.0'}">
                  </div>
                  <label class="input-label">Comentário</label>
                  <textarea id="edit-comment-${item.mal_id}" placeholder="Comentário...">${escapeHTML(myVote?.comment||'')}</textarea>
                  <button onclick="window.saveVoteEdit('${item.mal_id}')" class="btn btn-primary">Salvar Alterações</button>
                </div>
              </div>
            </div>
            
            <div class="card-footer">${otherVotes}</div>
          </div>
        </div>
      `;
    }).join('')}`;
}

function normalizeLinks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(l => l && l.url);
  if (typeof raw === 'object') return Object.entries(raw).filter(([, v]) => v).map(([name, url]) => ({ name, url }));
  return [];
}

window.toggleEditPanel = (malId) => document.getElementById(`edit-panel-${malId}`).classList.toggle('open');
window.toggleAddLink = (e, malId) => {
  e.stopPropagation();
  document.getElementById(`add-link-panel-${malId}`).classList.toggle('open');
};

window.saveNewLink = async (malId) => {
  const name = document.getElementById(`new-link-name-${malId}`).value.trim();
  const url = document.getElementById(`new-link-url-${malId}`).value.trim();
  if(!name || !url) return alert("Preencha nome e URL.");
  try {
    const { data: item } = await supabase.from('group_animes').select('links').eq('group_id', currentGroupId).eq('mal_id', malId).single();
    const newLinks = [...normalizeLinks(item.links), { name, url }];
    const { error } = await supabase.from('group_animes').update({ links: newLinks }).eq('group_id', currentGroupId).eq('mal_id', malId);
    if(error) throw error;
    loadHistory();
  } catch (err) { alert("Erro ao adicionar link."); }
};

window.saveVoteEdit = async (malId) => {
  const watchStatus = document.querySelector(`input[name="edit-watch-${malId}"]:checked`)?.value;
  const score = watchStatus === 'watched' ? parseFloat(document.getElementById(`edit-score-${malId}`).value) : null;
  const comment = document.getElementById(`edit-comment-${malId}`).value.trim();
  try {
    const { error } = await supabase.from('votes').upsert({ group_id: currentGroupId, mal_id: parseInt(malId), user_id: currentUser.id, score, comment: comment || null }, { onConflict: 'group_id, mal_id, user_id' });
    if (error) throw error;
    loadHistory();
  } catch (err) { alert("Erro ao salvar voto."); }
};

init();
