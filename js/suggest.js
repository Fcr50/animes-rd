// js/suggest.js
import { supabase } from './supabase-client.js';
import { getGroupId, normalizeText, escapeHTML } from './utils.js';
import { loadData } from './data.js';

const animeNameInput = document.getElementById("anime-name");
const resultsDropdown = document.getElementById("search-results-list");
const detailsSection = document.getElementById("anime-details-section");
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
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".suggest-panel").forEach(p => b.classList.remove("active")); // Correção aqui
      // Corrigindo loop de tabs
      document.querySelectorAll(".suggest-panel").forEach(p => p.classList.remove("active"));
      
      btn.classList.add("active");
      const panelId = `panel-${btn.dataset.tab}`;
      document.getElementById(panelId).classList.add("active");
    };
  });
}

async function loadLibraryAndGroup() {
  try {
    // 1. Pega animes que o grupo já tem
    const { data: groupAnimes } = await supabase
      .from('group_animes')
      .select('mal_id')
      .eq('group_id', currentGroupId);
    
    groupAnimeIds = new Set(groupAnimes.map(a => a.mal_id));

    // 2. Pega biblioteca pessoal do usuário
    const { data: library, error } = await supabase
      .from('user_library')
      .select('*, animes(*)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    userLibrary = library;

    renderImportList();
  } catch (err) {
    console.error("Erro ao carregar histórico:", err);
    if(importContainer) importContainer.innerHTML = "<p>Erro ao carregar histórico.</p>";
  }
}

function renderImportList() {
  if (!importContainer) return;
  
  if (userLibrary.length === 0) {
    importContainer.innerHTML = "<p style='padding:20px; color:var(--faint)'>Você ainda não tem animes no seu histórico pessoal.</p>";
    return;
  }

  importContainer.innerHTML = userLibrary.map(item => {
    const anime = item.animes;
    const exists = groupAnimeIds.has(anime.mal_id);
    
    return `
      <label class="import-item ${exists ? 'exists' : ''}" title="${exists ? 'Este anime já está no acervo do grupo' : ''}">
        <input type="checkbox" 
               value="${anime.mal_id}" 
               ${exists ? 'disabled' : ''} 
               onchange="window.toggleSelectImport('${anime.mal_id}', this.checked)">
        <img src="${anime.image_url}" onerror="this.src='assets/placeholder.png'">
        <div class="import-item-info">
          <strong>${escapeHTML(anime.name)}</strong>
          <p style="font-size:11px; color:var(--faint)">Sua nota: ${item.last_score || '—'}</p>
        </div>
        ${exists ? '<span style="font-size:10px; color:var(--accent); font-weight:bold;">JÁ NO ACERVO</span>' : ''}
      </label>
    `;
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
  importBtn.textContent = "Importando...";

  const ids = Array.from(selectedToImport);
  let successCount = 0;

  for (const malId of ids) {
    const historicalData = userLibrary.find(l => l.mal_id === malId);
    
    try {
      // 1. Criar Instância no Grupo
      const { error: groupError } = await supabase.from('group_animes').insert([{
        group_id: currentGroupId,
        mal_id: malId,
        added_by: currentUser.id,
        status: 'pending'
      }]);

      if (!groupError) {
        // 2. Inserir o Voto histórico neste Grupo
        await supabase.from('votes').insert([{
          group_id: currentGroupId,
          mal_id: malId,
          user_id: currentUser.id,
          score: historicalData.last_score,
          comment: historicalData.last_comment || "Importado do meu histórico."
        }]);
        successCount++;
      }
    } catch (err) {
      console.error(`Erro ao importar ${malId}:`, err);
    }
  }

  alert(`${successCount} animes importados com sucesso!`);
  window.location.href = `pending.html#g=${currentGroupId}`;
}

// --- Lógica de Sugestão Manual (MAL) ---

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
      <img src="${anime.images.jpg.image_url}" width="40">
      <div><strong>${anime.title}</strong><small>${anime.year || 'N/A'}</small></div>
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
      <div style="display:flex; gap:15px; align-items:center">
        <img src="${currentAnimeData.imageUrl}" style="width:60px; border-radius:8px">
        <div>
          <h4 style="margin:0">${currentAnimeData.name}</h4>
          <p style="font-size:12px; margin:5px 0">${currentAnimeData.genres.join(", ")}</p>
        </div>
      </div>`;
    detailsSection.classList.remove("hidden");
  }
}

async function handleSubmit() {
  if (!currentGroupId || !currentAnimeData) {
    alert("Selecione um anime primeiro.");
    return;
  }
  const score = parseFloat(document.getElementById("my-score")?.value || 5);
  const comment = document.getElementById("my-comment")?.value.trim() || "Sugerido por mim.";

  try {
    // Upsert na Global
    await supabase.from('animes').upsert([{ mal_id: currentAnimeData.malId, name: currentAnimeData.name, genres: currentAnimeData.genres, image_url: currentAnimeData.imageUrl }]);
    // Upsert na Pessoal
    await supabase.from('user_library').upsert([{ user_id: currentUser.id, mal_id: currentAnimeData.malId, last_score: score, last_comment: comment }]);
    // Inserir no Grupo
    const { error } = await supabase.from('group_animes').insert([{ group_id: currentGroupId, mal_id: currentAnimeData.malId, added_by: currentUser.id, status: 'pending' }]);
    
    if (error) {
      if (error.code === '23505') alert("Já existe no acervo!");
      else throw error;
      return;
    }
    // Votar
    await supabase.from('votes').insert([{ group_id: currentGroupId, mal_id: currentAnimeData.malId, user_id: currentUser.id, score, comment }]);

    alert("Sugerido com sucesso!");
    window.location.href = `pending.html#g=${currentGroupId}`;
  } catch (err) { alert(err.message); }
}

init();
