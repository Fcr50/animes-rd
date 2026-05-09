// js/suggest.js
import { supabase } from './supabase-client.js';
import { getGroupId, normalizeText, escapeHTML } from './utils.js';
import { loadData, prettyGenre } from './data.js';

const animeNameInput = document.getElementById("anime-name");
const resultsDropdown = document.getElementById("search-results-list");
const detailsSection = document.getElementById("anime-details-section");
const manualFields = document.getElementById("manual-fields");
const genresInput = document.getElementById("anime-genres");
const notWatchedCheck = document.getElementById("not-watched-check");
const ratingFields = document.getElementById("rating-fields");

const importContainer = document.getElementById("import-list-container");
const importBtn = document.getElementById("import-selected-button");
const genreFilterImport = document.getElementById("filter-genre-import");

let currentAnimeData = null; 
let currentUser = null;
let currentGroupId = null;
let selectedToImport = new Set();
let userLibrary = [];
let groupAnimeIds = new Set();

// Mapeamento Jikan (English) -> Animes RD (Português Limpo)
const GENRE_MAP = {
  "Action": "Ação", "Adventure": "Aventura", "Comedy": "Comédia", "Drama": "Drama",
  "Fantasy": "Fantasia", "Horror": "Terror", "Mystery": "Mistério", "Romance": "Romance",
  "Sci-Fi": "Ficção Científica", "Suspense": "Suspense", "Slice of Life": "Slice of Life",
  "Sports": "Esportes", "Supernatural": "Sobrenatural", "Psychological": "Psicológico",
  "Ecchi": "Ecchi", "Mecha": "Mecha", "Music": "Música", "Award Winning": "Premiado",
  "Gourmet": "Culinária", "Boys Love": "BL", "Girls Love": "GL", "Hentai": "Hentai",
  "Super Power": "Superpoderes", "Erotica": "Hentai", "Historical": "Histórico",
  "Military": "Militar", "Magia": "Magia", "Martial Arts": "Artes Marciais",
  "Vampiro": "Vampiro", "Demons": "Demônios", "School": "Escola", "Space": "Espaço",
  "Samurai": "Samurai", "Police": "Policial", "Harem": "Harém", "Game": "Jogo",
  "Parody": "Paródia", "Isekai": "Isekai", "Seinen": "Seinen", "Shounen": "Shounen"
};

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

  // Filtro de gênero na importação
  genreFilterImport?.addEventListener("change", () => renderImportList());
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

function translateGenres(apiGenres) {
  return apiGenres.map(g => {
    const translated = GENRE_MAP[g] || g;
    return prettyGenre(translated);
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

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-container")) {
      resultsDropdown?.classList.add("hidden");
    }
  });
}

async function fetchJikan(query) {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
    if (!res.ok) throw new Error("Jikan offline");
    const { data } = await res.json();
    renderResults(data || [], false);
  } catch (err) {
    // Fallback para banco local (cache global)
    fetchLocalSearch(query);
  }
}

async function fetchLocalSearch(query) {
  try {
    const { data, error } = await supabase
      .from('animes')
      .select('*')
      .ilike('name', `%${query}%`)
      .limit(5);

    if (error) throw error;
    
    // Converte formato local para o esperado pelo renderResults (parcialmente)
    const formatted = (data || []).map(a => ({
      mal_id: a.mal_id,
      title: a.name,
      images: { jpg: { image_url: a.image_url, large_image_url: a.image_url } },
      genres: (a.genres || []).map(g => ({ name: g })),
      local: true
    }));

    renderResults(formatted, true);
  } catch (err) {
    renderResults([], true, true);
  }
}

function renderResults(list, isLocal = false, isError = false) {
  if (!resultsDropdown) return;
  resultsDropdown.innerHTML = "";
  resultsDropdown.classList.remove("hidden");

  if (isError) {
    resultsDropdown.innerHTML = `<li style="padding:15px; color:#f87171; font-size:12px; text-align:center;">
      <strong>⚠️ Erro de Conexão</strong><br>
      O MyAnimeList está instável no momento. Tente novamente mais tarde.
    </li>`;
    return;
  }

  if (isLocal && list.length > 0) {
    const notice = document.createElement("li");
    notice.style = "padding:8px 12px; background:rgba(251,191,36,0.1); color:#fbbf24; font-size:10px; font-weight:800; text-transform:uppercase; border-bottom:1px solid rgba(251,191,36,0.2);";
    notice.innerHTML = "⚠️ MyAnimeList Offline - Mostrando resultados do banco local";
    resultsDropdown.appendChild(notice);
  } else if (isLocal && list.length === 0) {
     resultsDropdown.innerHTML = `<li style="padding:15px; color:var(--faint); font-size:12px; text-align:center;">
      Nenhum anime encontrado no banco local e o MyAnimeList está fora do ar.
    </li>`;
     return;
  }

  list.forEach(anime => {
    const li = document.createElement("li");
    li.className = "search-result-item";
    li.innerHTML = `
      <img src="${anime.images.jpg.image_url}">
      <div>
        <strong>${anime.title}</strong>
        <small>${anime.year || (anime.local ? 'Banco Local' : 'N/A')} · ${anime.type || 'Anime'}</small>
      </div>
    `;
    li.onclick = () => selectAnime(anime);
    resultsDropdown.appendChild(li);
  });
}

function selectAnime(anime) {
  // Se for local, os gêneros já estão traduzidos
  const prettyGenresList = anime.local 
    ? anime.genres.map(g => g.name)
    : translateGenres(anime.genres.map(g => g.name));

  const existsInGroup = groupAnimeIds.has(anime.mal_id);

  currentAnimeData = {
    malId: anime.mal_id,
    name: anime.title,
    genres: prettyGenresList,
    imageUrl: anime.images.jpg.large_image_url || anime.images.jpg.image_url,
  };

  if (animeNameInput) animeNameInput.value = anime.title;
  if (genresInput) genresInput.value = prettyGenresList.join(", ");
  
  resultsDropdown?.classList.add("hidden");
  manualFields?.classList.remove("hidden");
  
  if (detailsSection) {
    const statusMsg = existsInGroup 
      ? `<p style="font-size:12px; margin:0; color:#ef4444; font-weight:800;">⚠️ Este anime já existe no acervo do grupo!</p>`
      : `<p style="font-size:12px; margin:0; color:#86efac; font-weight:800;">✓ Pronto para sugestão</p>`;

    detailsSection.innerHTML = `
      <div style="display:flex; gap:15px; align-items:center">
        <img src="${currentAnimeData.imageUrl}" style="width:60px; height:80px; object-fit:cover; border-radius:8px">
        <div>
          <h4 style="margin:0; color:white; font-family:'Newsreader', serif;">${currentAnimeData.name}</h4>
          <p style="font-size:11px; margin:5px 0; color:var(--faint)">${prettyGenresList.slice(0, 3).join(", ")}</p>
          ${statusMsg}
        </div>
      </div>`;
    detailsSection.classList.remove("hidden");
  }

  const submitBtn = document.getElementById("submit-anime-button");
  if (submitBtn) submitBtn.disabled = existsInGroup;
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

  const links = {};
  document.querySelectorAll(".link-input-row").forEach(row => {
    const nameInput = row.querySelector(".link-name-input");
    const urlInput = row.querySelector(".link-url-input");
    if (nameInput && urlInput) {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      if (name && url) links[name] = url;
    }
  });

  try {
    await supabase.from('animes').upsert([{ 
      mal_id: currentAnimeData.malId, 
      name: currentAnimeData.name, 
      genres: currentAnimeData.genres, 
      image_url: currentAnimeData.imageUrl 
    }]);

    if (score !== null) {
      await supabase.from('user_library').upsert([{ 
        user_id: currentUser.id, 
        mal_id: currentAnimeData.malId, 
        last_score: score, 
        last_comment: comment 
      }]);
    }

    const { error } = await supabase.from('group_animes').insert([{ 
      group_id: currentGroupId, 
      mal_id: currentAnimeData.malId, 
      added_by: currentUser.id, 
      status: 'pending',
      links: links
    }]);
    
    if (error) {
      if (error.code === '23505') alert("Este anime já existe no acervo do grupo!");
      else throw error;
      return;
    }

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

    // Popula dropdown de gêneros
    const genres = new Set();
    userLibrary.forEach(item => {
      (item.animes?.genres || []).forEach(g => genres.add(g));
    });
    
    if (genreFilterImport) {
      genreFilterImport.innerHTML = '<option value="">Todos os Gêneros</option>' + 
        Array.from(genres).sort().map(g => `<option value="${g}">${g}</option>`).join("");
    }

    renderImportList();
  } catch (err) { }
}

function renderImportList() {
  if (!importContainer) return;
  if (userLibrary.length === 0) {
    importContainer.innerHTML = "<p style='padding:20px; color:var(--faint)'>Histórico vazio.</p>";
    return;
  }

  const genre = genreFilterImport?.value;
  const filtered = userLibrary.filter(item => {
    if (!genre) return true;
    return (item.animes?.genres || []).includes(genre);
  });

  importContainer.innerHTML = filtered.map(item => {
    const anime = item.animes;
    if (!anime) return "";
    const exists = groupAnimeIds.has(anime.mal_id);
    const thumb = anime.image_url || 'assets/placeholder.png';
    const isChecked = selectedToImport.has(anime.mal_id);
    
    return `
      <label class="import-item ${exists ? 'exists' : ''}">
        <input type="checkbox" 
               ${exists ? 'disabled' : ''} 
               ${isChecked ? 'checked' : ''}
               onchange="window.toggleSelectImport('${anime.mal_id}', this.checked)">
        <img src="${thumb}" onerror="this.src='assets/placeholder.png'">
        <div class="import-item-info">
          <strong>${escapeHTML(anime.name)}</strong>
          <p style="font-size:11px; color:var(--faint)">Sua nota: ${item.last_score !== null ? Number(item.last_score).toFixed(1) : '—'}</p>
        </div>
        ${exists ? '<div style="position:absolute; bottom:8px; right:12px; font-size:9px; color:var(--accent); font-weight:800; background:rgba(0,0,0,0.4); padding:2px 6px; border-radius:4px;">NO ACERVO</div>' : ''}
      </label>`;
  }).join("");

  updateImportButton();
}

window.toggleSelectImport = (malId, checked) => {
  const id = parseInt(malId);
  if (checked) selectedToImport.add(id);
  else selectedToImport.delete(id);
  updateImportButton();
};

window.selectAllImport = () => {
  const genre = genreFilterImport?.value;
  userLibrary.forEach(item => {
    if (!groupAnimeIds.has(item.mal_id)) {
      if (!genre || (item.animes?.genres || []).includes(genre)) {
        selectedToImport.add(item.mal_id);
      }
    }
  });
  renderImportList();
};

function updateImportButton() {
  if (importBtn) {
    importBtn.disabled = selectedToImport.size === 0;
    importBtn.textContent = `Importar Selecionados (${selectedToImport.size})`;
    importBtn.style.background = selectedToImport.size > 0 
      ? 'linear-gradient(90deg, #f9a8d4 0%, #c4b5fd 50%, #86efac 100%)' 
      : 'rgba(255,255,255,0.05)';
    importBtn.style.color = selectedToImport.size > 0 ? '#1a1826' : 'var(--faint)';
  }
}

async function handleImport() {
  if (selectedToImport.size === 0) return;
  
  importBtn.disabled = true;
  importBtn.textContent = "Importando...";

  const ids = Array.from(selectedToImport);
  let successCount = 0;
  let errors = [];

  for (const malId of ids) {
    const historical = userLibrary.find(l => l.mal_id === malId);
    if (!historical) continue;

    try {
      const { error: groupError } = await supabase
        .from('group_animes')
        .insert([{ 
          group_id: currentGroupId, 
          mal_id: malId, 
          added_by: currentUser.id, 
          status: 'pending' 
        }]);

      if (groupError) {
        if (groupError.code !== '23505') throw groupError;
      } else {
        if (historical.last_score !== null) {
          await supabase.from('votes').insert([{ 
            group_id: currentGroupId, 
            mal_id: malId, 
            user_id: currentUser.id, 
            score: historical.last_score, 
            comment: historical.last_comment || "Importado do meu histórico." 
          }]);
        }
        successCount++;
      }
    } catch (err) {
      errors.push(`${historical.animes?.name || malId}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    alert(`Importação concluída com avisos:\n${successCount} sucesso(s)\n${errors.length} erro(s).`);
  } else {
    alert(`${successCount} animes importados com sucesso para a fila de aprovação!`);
  }
  
  window.location.href = `pending.html#g=${currentGroupId}`;
}

// Global helper for link rows
window.addNewLinkRow = () => {
  const container = document.getElementById("links-container-rows");
  const row = document.createElement("div");
  row.className = "link-input-row";
  row.innerHTML = `
    <input type="text" placeholder="Nome (ex: Opening 1)" class="link-name-input">
    <input type="url" placeholder="https://..." class="link-url-input">
    <button type="button" class="btn-remove-link" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(row);
};

init();
