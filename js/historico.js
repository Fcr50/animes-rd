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
  members = m || [];

  await loadHistory();

  // Escuta mudanças para atualizar em tempo real
  supabase
    .channel('realtime-history')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `group_id=eq.${currentGroupId}` }, loadHistory)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_animes', filter: `group_id=eq.${currentGroupId}` }, loadHistory)
    .subscribe();
}

async function loadHistory() {
  // Busca animes que o usuário votou E que ainda estão pendentes
  const { data: votedItems, error } = await supabase
    .from('group_animes')
    .select(`
      status,
      mal_id,
      links,
      added_by,
      created_at,
      animes!inner (name, genres, image_url),
      votes!inner (user_id, score, comment)
    `)
    .eq('group_id', currentGroupId)
    .eq('status', 'pending')
    .eq('votes.user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p>Erro ao carregar histórico.</p>`;
    return;
  }

  const animeIds = votedItems.map(a => a.mal_id);
  
  if (animeIds.length === 0) {
    renderList([], []);
    return;
  }

  const { data: allVotes } = await supabase
    .from('votes')
    .select('mal_id, user_id, score, comment')
    .eq('group_id', currentGroupId)
    .in('mal_id', animeIds);

  renderList(votedItems, allVotes || []);
}

function getSubmitterName(userId) {
  const m = members.find(m => m.user_id === userId);
  return m ? m.nickname : "Desconhecido";
}

function renderList(animes, allVotes) {
  if (!animes.length) {
    container.innerHTML = `
      <div style="text-align:center; padding:100px 20px; grid-column: 1/-1;">
        <div style="font-size:48px; margin-bottom:16px">📭</div>
        <p style="font-size:18px; font-weight:700; color:var(--paper)">Nenhum voto pendente</p>
        <p style="color:var(--faint); font-size:14px; margin-top:8px">Os animes que você votou aparecem aqui enquanto aguardam os outros membros.</p>
        <a href="pending.html#g=${currentGroupId}" class="pending-history-btn" style="margin-top:24px; display:inline-block">← Ir para a fila</a>
      </div>`;
    return;
  }

  const myMember = members.find(m => m.user_id === currentUser.id);

  // Injetamos um estilo específico para o Histórico para bater com a imagem
  const gridStyle = `
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    gap: 24px;
    margin-top: 20px;
  `;

  container.innerHTML = `
    <div style="margin-bottom:24px; color:var(--muted); font-size:14px">
      ${animes.length} animes votados por <strong style="color:${myMember?.color}">${myMember?.nickname}</strong>
    </div>
    <div style="${gridStyle}">
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
          return `<span title="${m.nickname}"
            style="display:inline-flex;width:20px;height:20px;border-radius:50%;
                   align-items:center;justify-content:center;font-size:9px;font-weight:bold;
                   margin-left:4px;border:1.5px solid ${hasVoted ? c : "rgba(255,255,255,0.15)"};
                   background:${hasVoted ? c + '22' : "transparent"};color:${hasVoted ? c : "rgba(255,255,255,0.2)"}">${m.nickname[0].toUpperCase()}</span>`;
        }).join("");

        const otherVotes = animeVotes
          .filter(v => v.user_id !== currentUser.id)
          .map(v => {
            const m = members.find(mem => mem.user_id === v.user_id);
            const scoreLabel = v.score !== null ? Number(v.score).toFixed(1) : "Não assisti";
            return `<span style="font-size:11px; background:rgba(255,255,255,0.04); padding:4px 10px; border-radius:12px; color:var(--faint)">${m?.nickname || '??'}: <strong style="color:${m?.color || '#eee'}">${scoreLabel}</strong></span>`;
          }).join(" ");

        return `
          <div class="history-card" style="background:#12141a; border:1px solid rgba(134,239,172,0.08); border-radius:20px; padding:24px; position:relative; overflow:hidden;">
            <!-- Subtle Background Image -->
            <div style="position:absolute; top:0; right:0; width:100%; height:100%; background:linear-gradient(to bottom, rgba(18,20,26,0.60) 0%, rgba(18,20,26,0.95) 80%, #12141a 100%), url('${anime.image_url}'); background-size:cover; background-position:center; z-index:0; opacity:0.30;"></div>
            
            <div style="position:relative; z-index:1;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <h3 style="margin:0; font-family:'Newsreader', serif; font-size:22px; color:#fff;">${escapeHTML(anime.name)}</h3>
                <div style="display:flex">${dots}</div>
              </div>

              <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px;">
                ${(anime.genres || []).map(g => `<span class="pending-genre-chip" style="font-size:10px; padding:3px 10px;">${escapeHTML(g)}</span>`).join("")}
              </div>

              <p style="font-size:12px; color:var(--muted); margin-bottom:18px;">Sugerido por <strong style="color:${subColor}">${escapeHTML(subName)}</strong></p>

              <div style="margin-bottom:20px;">
                <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:rgba(255,255,255,0.3); margin-bottom:8px; font-weight:700;">Links</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;" id="links-list-${item.mal_id}">
                  ${links.map(l => `<a href="${escapeHTML(l.url)}" target="_blank" class="pending-link-chip" style="font-size:11px;">${escapeHTML(l.name)}</a>`).join("")}
                  <button onclick="window.toggleAddLink('${item.mal_id}')" class="pending-link-chip" style="background:none; border:1px dashed var(--accent); color:var(--accent); cursor:pointer;">+ Link</button>
                </div>
                <div id="add-link-panel-${item.mal_id}" style="display:none; margin-top:12px; padding:12px; background:rgba(0,0,0,0.2); border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
                  <input type="text" id="new-link-name-${item.mal_id}" placeholder="Nome (ex: Dublado)" style="width:100%; margin-bottom:8px; font-size:11px; padding:6px; background:rgba(0,0,0,0.3); border:1px solid var(--border); border-radius:6px; color:white;">
                  <input type="url" id="new-link-url-${item.mal_id}" placeholder="https://..." style="width:100%; margin-bottom:8px; font-size:11px; padding:6px; background:rgba(0,0,0,0.3); border:1px solid var(--border); border-radius:6px; color:white;">
                  <button onclick="window.saveNewLink('${item.mal_id}')" class="btn btn-primary" style="width:100%; padding:6px; font-size:11px;">Adicionar</button>
                </div>
              </div>

              <div style="background:rgba(134,239,172,0.03); border:1px solid rgba(134,239,172,0.1); border-radius:16px; padding:16px; margin-bottom:16px; position:relative;">
                <div style="font-weight:800; color:#86efac; font-size:15px; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
                  <span style="font-size:18px;">✓</span> Meu voto: ${myVote?.score !== null ? Number(myVote?.score).toFixed(1) : "Não assisti"}
                </div>
                ${myVote?.comment ? `<div style="font-style:italic; font-size:13px; color:rgba(134,239,172,0.7); line-height:1.4;">"${escapeHTML(myVote.comment)}"</div>` : ""}
                
                <button onclick="window.toggleEditPanel('${item.mal_id}')" 
                        style="position:absolute; top:12px; right:12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff; cursor:pointer; font-size:11px; font-weight:700; padding:6px 12px;">
                  Editar
                </button>

                <!-- Edit Panel Inline -->
                <div id="edit-panel-${item.mal_id}" style="display:none; margin-top:15px; padding-top:15px; border-top:1px solid rgba(134,239,172,0.1);">
                   <div style="display:flex; gap:15px; margin-bottom:12px;">
                      <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#fff; cursor:pointer;">
                        <input type="radio" name="edit-watch-${item.mal_id}" value="watched" ${myVote?.score !== null ? 'checked' : ''} onchange="document.getElementById('edit-score-wrap-${item.mal_id}').style.display='block'"> Assisti
                      </label>
                      <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#fff; cursor:pointer;">
                        <input type="radio" name="edit-watch-${item.mal_id}" value="not-watched" ${myVote?.score === null ? 'checked' : ''} onchange="document.getElementById('edit-score-wrap-${item.mal_id}').style.display='none'"> Não assisti
                      </label>
                   </div>
                   <div id="edit-score-wrap-${item.mal_id}" style="${myVote?.score !== null ? '' : 'display:none;'}">
                      <div style="display:flex; justify-content:space-between; font-size:11px; color:#86efac; margin-bottom:5px;">
                        <span>Nota</span><span id="edit-val-${item.mal_id}">${myVote?.score || '5.0'}</span>
                      </div>
                      <input type="range" id="edit-score-${item.mal_id}" min="0" max="10" step="0.1" value="${myVote?.score || '5.0'}" 
                             oninput="document.getElementById('edit-val-${item.mal_id}').textContent=parseFloat(this.value).toFixed(1)"
                             style="width:100%; margin-bottom:12px; accent-color:#86efac;">
                   </div>
                   <textarea id="edit-comment-${item.mal_id}" style="width:100%; background:rgba(0,0,0,0.4); border:1px solid rgba(134,239,172,0.2); border-radius:10px; color:#fff; font-size:12px; padding:10px; resize:vertical; min-height:60px; outline:none;" placeholder="Comentário...">${escapeHTML(myVote?.comment || '')}</textarea>
                   <button onclick="window.saveVoteEdit('${item.mal_id}')" class="btn btn-primary" style="width:100%; margin-top:12px; padding:8px; font-size:12px; background:#86efac; color:#12141a; font-weight:800;">Salvar Alterações</button>
                </div>
              </div>

              <div style="display:flex; flex-wrap:wrap; gap:8px;">
                ${otherVotes}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function normalizeLinks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(l => l && l.url);
  if (typeof raw === 'object') return Object.entries(raw).filter(([, v]) => v).map(([name, url]) => ({ name, url }));
  return [];
}

// ── Funções de Ação Global ───────────────────────────────────────────────────

window.toggleEditPanel = (malId) => {
  const p = document.getElementById(`edit-panel-${malId}`);
  if(p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
};

window.toggleAddLink = (malId) => {
  const p = document.getElementById(`add-link-panel-${malId}`);
  if(p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
};

window.saveNewLink = async (malId) => {
  const name = document.getElementById(`new-link-name-${malId}`).value.trim();
  const url = document.getElementById(`new-link-url-${malId}`).value.trim();
  if(!name || !url) return alert("Preencha nome e URL.");

  try {
    const { data: item } = await supabase.from('group_animes').select('links').eq('group_id', currentGroupId).eq('mal_id', malId).single();
    const currentLinks = normalizeLinks(item.links);
    const newLinks = [...currentLinks, { name, url }];
    
    // Converte de volta para objeto se necessário ou mantém array
    const { error } = await supabase.from('group_animes').update({ links: newLinks }).eq('group_id', currentGroupId).eq('mal_id', malId);
    if(error) throw error;
    loadHistory();
  } catch (err) {
    alert("Erro ao adicionar link.");
  }
};

window.saveVoteEdit = async (malId) => {
  const watchStatus = document.querySelector(`input[name="edit-watch-${malId}"]:checked`)?.value;
  const score = watchStatus === 'watched' ? parseFloat(document.getElementById(`edit-score-${malId}`).value) : null;
  const comment = document.getElementById(`edit-comment-${malId}`).value.trim();

  try {
    const { error } = await supabase
      .from('votes')
      .upsert({ 
        group_id: currentGroupId,
        mal_id: parseInt(malId), 
        user_id: currentUser.id, 
        score, 
        comment: comment || null
      }, { onConflict: 'group_id, mal_id, user_id' });

    if (error) throw error;
    loadHistory();
  } catch (err) {
    alert("Erro ao salvar voto.");
  }
};

init();
