// js/suggest.js
import { supabase } from './supabase-client.js';
import { getGroupId, normalizeText, escapeHTML } from './utils.js';
import { loadData } from './data.js';

const animeNameInput = document.getElementById("anime-name");
const resultsDropdown = document.getElementById("search-results-list");
const detailsSection = document.getElementById("anime-details-section");

let currentAnimeData = null; // Guardará o anime selecionado da API
let currentUser = null;

async function init() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Você precisa estar logado para sugerir animes.");
    window.location.href = "index.html";
    return;
  }
  currentUser = user;

  setupSearch();
  
  const submitBtn = document.getElementById("submit-anime-button");
  submitBtn?.addEventListener("click", handleSubmit);
}

function setupSearch() {
  if (!animeNameInput) return;

  let timeout = null;
  animeNameInput.addEventListener("input", () => {
    clearTimeout(timeout);
    const query = animeNameInput.value.trim();
    if (query.length < 3) {
      resultsDropdown?.classList.add("hidden");
      return;
    }
    timeout = setTimeout(() => fetchJikan(query), 500);
  });
}

async function fetchJikan(query) {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
    const { data } = await res.json();
    renderResults(data || []);
  } catch (err) {
    console.error("Erro Jikan:", err);
  }
}

function renderResults(list) {
  if (!resultsDropdown) return;
  resultsDropdown.innerHTML = "";
  resultsDropdown.classList.remove("hidden");

  list.forEach(anime => {
    const li = document.createElement("li");
    li.className = "search-result-item";
    li.innerHTML = `
      <img src="${anime.images.jpg.image_url}" width="40">
      <div>
        <strong>${anime.title}</strong>
        <small>${anime.year || 'N/A'} · ${anime.type}</small>
      </div>
    `;
    li.onclick = () => selectAnime(anime);
    resultsDropdown.appendChild(li);
  });
}

function selectAnime(anime) {
  currentAnimeData = {
    malId: anime.mal_id,
    name: anime.title,
    genres: anime.genres.map(g => g.name),
    imageUrl: anime.images.jpg.large_image_url || anime.images.jpg.image_url,
  };

  animeNameInput.value = anime.title;
  resultsDropdown?.classList.add("hidden");
  
  if (detailsSection) {
    detailsSection.innerHTML = `
      <div class="selected-anime-preview">
        <img src="${currentAnimeData.imageUrl}" style="max-width: 150px; border-radius: 10px;">
        <div>
          <h3>${currentAnimeData.name}</h3>
          <p>${currentAnimeData.genres.join(", ")}</p>
          <p style="color:var(--accent)">✓ Anime selecionado da biblioteca global.</p>
        </div>
      </div>
    `;
    detailsSection.classList.remove("hidden");
  }
}

async function handleSubmit() {
  const groupId = getGroupId();
  if (!groupId || !currentAnimeData) {
    alert("Por favor, selecione um anime da lista primeiro.");
    return;
  }

  const score = parseFloat(document.getElementById("my-score")?.value || 5);
  const comment = document.getElementById("my-comment")?.value.trim() || "Sugerido por mim.";

  try {
    // 1. Salvar na Biblioteca Global (Cache)
    await supabase.from('animes').upsert([{
      mal_id: currentAnimeData.malId,
      name: currentAnimeData.name,
      genres: currentAnimeData.genres,
      image_url: currentAnimeData.imageUrl
    }]);

    // 2. Salvar na Biblioteca Pessoal (Histórico do Usuário)
    await supabase.from('user_library').upsert([{
      user_id: currentUser.id,
      mal_id: currentAnimeData.malId,
      last_score: score,
      last_comment: comment
    }]);

    // 3. Criar Instância no Grupo
    const { error: groupError } = await supabase.from('group_animes').insert([{
      group_id: groupId,
      mal_id: currentAnimeData.malId,
      added_by: currentUser.id,
      status: 'pending'
    }]);

    if (groupError) {
      if (groupError.code === '23505') alert("Este anime já existe no acervo deste grupo!");
      else throw groupError;
      return;
    }

    // 4. Inserir o Voto do Sugeridor neste Grupo
    await supabase.from('votes').insert([{
      group_id: groupId,
      mal_id: currentAnimeData.malId,
      user_id: currentUser.id,
      score: score,
      comment: comment
    }]);

    alert("Anime sugerido com sucesso e adicionado ao seu histórico!");
    window.location.href = `pending.html#g=${groupId}`;

  } catch (err) {
    console.error(err);
    alert("Erro ao processar sugestão: " + err.message);
  }
}

init();
