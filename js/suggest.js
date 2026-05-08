// js/suggest.js
import { supabase } from './supabase-client.js';
import { getGroupId, normalizeText } from './utils.js';
import { loadData } from './data.js';

const submissionFormContainer = document.getElementById("submission-form-container");
const resultsDropdown = document.getElementById("search-results-list");
const animeNameInput = document.getElementById("anime-name");

let currentAnimeData = null;
let currentUser = null;

async function init() {
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user;

  // Carrega dados iniciais do grupo
  const { members } = await loadData();
  
  if (submissionFormContainer) {
    renderForm();
  }
}

function renderForm() {
  // Reutiliza a estrutura HTML existente, mas adaptada para Supabase
  // ... (vou simplificar aqui para focar na lógica de inserção)
  const submitBtn = document.getElementById("submit-anime-button");
  submitBtn?.addEventListener("click", handleSubmit);
}

async function handleSubmit() {
  const groupId = getGroupId();
  const name = document.getElementById("anime-name")?.value.trim();
  const genresRaw = document.getElementById("anime-genres")?.value.trim();
  
  if (!name || !groupId) return;

  const genres = genresRaw.split(',').map(g => g.trim()).filter(Boolean);

  const { data: anime, error } = await supabase
    .from('animes')
    .insert([{
      group_id: groupId,
      name: name,
      mal_id: currentAnimeData?.malId,
      status: 'pending'
    }])
    .select()
    .single();

  if (error) {
    alert('Erro ao sugerir anime: ' + error.message);
    return;
  }

  // Auto-vote "Sugerido por mim"
  await supabase
    .from('votes')
    .insert([{
      anime_id: anime.id,
      user_id: currentUser.id,
      score: 5.0,
      comment: 'Sugerido por mim.'
    }]);

  alert('Anime sugerido com sucesso!');
  window.location.href = `pending.html?g=${groupId}`;
}

// ... (fetchAnimeData e outras funções auxiliares permanecem similares)

init();
