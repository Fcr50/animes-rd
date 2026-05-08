// js/pending.js
import { supabase } from './supabase-client.js';
import { getGroupId } from './utils.js';

const pendingAnimesContainer = document.getElementById("pending-animes-container");

let currentGroupId = null;
let members = [];

async function init() {
  currentGroupId = getGroupId();
  if (!currentGroupId) return;

  // Load members first
  const { data: m } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', currentGroupId);
  members = m;

  // Initial load
  await loadPendingAnimes();

  // Real-time subscription
  supabase
    .channel('pending-animes')
    .on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'animes',
      filter: `group_id=eq.${currentGroupId}` 
    }, loadPendingAnimes)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'votes'
    }, loadPendingAnimes)
    .subscribe();
}

async function loadPendingAnimes() {
  const { data: animes, error } = await supabase
    .from('animes')
    .select('*, votes(user_id, score, comment)')
    .eq('group_id', currentGroupId)
    .eq('status', 'pending');

  if (error) {
    console.error(error);
    return;
  }

  renderList(animes);
}

function renderList(animes) {
  if (!animes.length) {
    pendingAnimesContainer.innerHTML = '<p style="text-align: center; color: var(--faint);">Nenhum anime na fila.</p>';
    return;
  }

  pendingAnimesContainer.innerHTML = animes.map(anime => {
    // ... logic to render dots/initials based on members vs votes ...
    // (similar to the previous suggest.js but using Supabase relations)
    return `
      <div class="card">
        <h3>${anime.name}</h3>
        <p>Aguardando votos...</p>
        <button class="btn" onclick="castVote('${anime.id}')">Votar</button>
      </div>
    `;
  }).join('');
}

init();
