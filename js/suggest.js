// js/suggest.js
import { supabase } from './supabase-client.js';
import { getGroupId, normalizeText, escapeHTML } from './utils.js';
import { loadData } from './data.js';

const animeNameInput = document.getElementById("anime-name");
const resultsDropdown = document.getElementById("search-results-list");
const detailsSection = document.getElementById("anime-details-section");
const manualFields = document.getElementById("manual-fields");
const genresInput = document.getElementById("anime-genres");
const notWatchedCheck = document.getElementById("not-watched-check");
const ratingFields = document.getElementById("rating-fields");

const importContainer = document.getElementById("import-list-container");
const importBtn = document.getElementById("import-selected-button");

let currentAnimeData = null; 
let currentUser = null;
let currentGroupId = null;
let selectedToImport = new Set();
let userLibrary = [];
let groupAnimeIds = new Set();

async function init() {
  currentGroupId = getGroupId();
  if (!currentGroupId) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Você precisa estar logado para sugerir animes.");
    window.location.href = "index.html";
    return;
  }
  currentUser = user;

  setupTabs();
  setupSearch();
  loadLibraryAndGroup();
  
  document.getElementById("submit-anime-button")?.addEventListener("click", handleSubmit);
  importBtn?.addEventListener("click", handleImport);

  // Toggle "Não assisti"
  notWatchedCheck?.addEventListener("change", (e) => {
    if (ratingFields) ratingFields.style.display = e.target.checked ? "none" : "grid";
  });
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".suggest-panel").forEach(p => p.classList.remove("active"));
      
      btn.classList.add("active");
      const panelId = `panel-${btn.dataset.tab}`;
      document.getElementById(panelId).classList.add("active");
    };
  });
}

// --- Lógica de Busca Jikan ---

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

  // Fecha dropdown ao clicar fora
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-container")) {
      resultsDropdown?.classList.add("hidden");
    }
  });
}

async function fetchJikan(query) {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
    const { data } = await res.json();
    renderResults(data || []);
  } catch (err) { console.error("Erro Jikan:", err); }
}

function renderResults(list) {
  if (!resultsDropdown) return;
  resultsDropdown.innerHTML = "";
  resultsDropdown.classList.remove("hidden");

  list.forEach(anime => {
    const li = document.createElement("li");
    li.className = "search-result-item";
    li.innerHTML = `
      <img src="${anime.images.jpg.image_url}">
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

  if (animeNameInput) animeNameInput.value = anime.title;
  if (genresInput) genresInput.value = currentAnimeData.genres.join(", ");
  
  resultsDropdown?.classList.add("hidden");
  manualFields?.classList.remove("hidden");
  
  if (detailsSection) {
    detailsSection.innerHTML = `
      <div style="display:flex; gap:15px; align-items:center">
        <img src="${currentAnimeData.imageUrl}" style="width:60px; height:80px; object-fit:cover; border-radius:8px">
        <div>
          <h4 style="margin:0; color:white;">${currentAnimeData.name}</h4>
          <p style="font-size:12px; margin:5px 0; color:var(--accent)">✓ Anime pronto para sugestão</p>
        </div>
      </div>`;
    detailsSection.classList.remove("hidden");
  }
}

// --- Submissão de Novo Anime ---

async function handleSubmit() {
  if (!currentGroupId || !currentAnimeData) {
    alert("Selecione um anime primeiro.");
    return;
  }

  const isNotWatched = notWatchedCheck?.checked;
  const score = isNotWatched ? null : parseFloat(document.getElementById("my-score")?.value || 5);
  const comment = document.getElementById("my-comment")?.value.trim() || (isNotWatched ? "Ainda não assisti." : "Sugerido por mim.");

  try {
    // 1. Salvar na Biblioteca Global (Cache)
    await supabase.from('animes').upsert([{ 
      mal_id: currentAnimeData.malId, 
      name: currentAnimeData.name, 
      genres: currentAnimeData.genres, 
      image_url: currentAnimeData.imageUrl 
    }]);

    // 2. Salvar na Biblioteca Pessoal (Histórico)
    await supabase.from('user_library').upsert([{ 
      user_id: currentUser.id, 
      mal_id: currentAnimeData.malId, 
      last_score: score, 
      last_comment: comment 
    }]);

    // 3. Criar Instância no Grupo
    const { error } = await supabase.from('group_animes').insert([{ 
      group_id: currentGroupId, 
      mal_id: currentAnimeData.malId, 
      added_by: currentUser.id, 
      status: 'pending' 
    }]);
    
    if (error) {
      if (error.code === '23505') alert("Este anime já existe no acervo do grupo!");
      else throw error;
      return;
    }

    // 4. Inserir o Voto do Sugeridor
    await supabase.from('votes').insert([{ 
      group_id: currentGroupId, 
      mal_id: currentAnimeData.malId, 
      user_id: currentUser.id, 
      score, 
      comment 
    }]);

    alert("Sugerido com sucesso!");
    window.location.href = `pending.html#g=${currentGroupId}`;

  } catch (err) { alert("Erro: " + err.message); }
}

// --- Importação de Histórico ---

async function loadLibraryAndGroup() {
  try {
    const { data: groupAnimes } = await supabase.from('group_animes').select('mal_id').eq('group_id', currentGroupId);
    groupAnimeIds = new Set(groupAnimes.map(a => a.mal_id));

    const { data: library, error } = await supabase
      .from('user_library')
      .select('*, animes(*)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    userLibrary = library;
    renderImportList();
  } catch (err) { console.error(err); }
}

function renderImportList() {
  if (!importContainer) return;
  if (userLibrary.length === 0) {
    importContainer.innerHTML = "<p style='padding:20px; color:var(--faint)'>Histórico vazio.</p>";
    return;
  }
  importContainer.innerHTML = userLibrary.map(item => {
    const anime = item.animes;
    const exists = groupAnimeIds.has(anime.mal_id);
    return `
      <label class="import-item ${exists ? 'exists' : ''}">
        <input type="checkbox" ${exists ? 'disabled' : ''} onchange="window.toggleSelectImport('${anime.mal_id}', this.checked)">
        <img src="${anime.image_url}" onerror="this.src='assets/placeholder.png'">
        <div class="import-item-info">
          <strong>${escapeHTML(anime.name)}</strong>
          <p style="font-size:11px; color:var(--faint)">Sua nota: ${item.last_score || '—'}</p>
        </div>
        ${exists ? '<span style="font-size:10px; color:var(--accent); font-weight:bold;">NO ACERVO</span>' : ''}
      </label>`;
  }).join("");
}

window.toggleSelectImport = (malId, checked) => {
  if (checked) selectedToImport.add(parseInt(malId));
  else selectedToImport.delete(parseInt(malId));
  if (importBtn) {
    importBtn.disabled = selectedToImport.size === 0;
    importBtn.textContent = `Importar Selecionados (${selectedToImport.size})`;
  }
};

async function handleImport() {
  if (selectedToImport.size === 0) return;
  importBtn.disabled = true;
  const ids = Array.from(selectedToImport);
  for (const malId of ids) {
    const historical = userLibrary.find(l => l.mal_id === malId);
    try {
      const { error } = await supabase.from('group_animes').insert([{ group_id: currentGroupId, mal_id: malId, added_by: currentUser.id, status: 'pending' }]);
      if (!error) {
        await supabase.from('votes').insert([{ group_id: currentGroupId, mal_id: malId, user_id: currentUser.id, score: historical.last_score, comment: historical.last_comment }]);
      }
    } catch (err) { console.error(err); }
  }
  alert("Importado com sucesso!");
  window.location.href = `pending.html#g=${currentGroupId}`;
}

init();
