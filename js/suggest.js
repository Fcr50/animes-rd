import { supabase } from "./supabase-client.js";
import { getGroupId, escapeHTML } from "./utils.js";
import { prettyGenre } from "./data.js";

const animeNameInput = document.getElementById("anime-name");
const resultsDropdown = document.getElementById("search-results-list");
const detailsSection = document.getElementById("anime-details-section");
const manualFields = document.getElementById("manual-fields");
const genresInput = document.getElementById("anime-genres");
const notWatchedCheck = document.getElementById("not-watched-check");
const ratingFields = document.getElementById("rating-fields");
const scoreInput = document.getElementById("my-score");
const commentInput = document.getElementById("my-comment");
const commentCounter = document.querySelector(".comment-counter");

const importContainer = document.getElementById("import-list-container");
const importBtn = document.getElementById("import-selected-button");
const genreFilterImport = document.getElementById("filter-genre-import");

let currentAnimeData = null;
let currentUser = null;
let currentGroupId = null;
let selectedToImport = new Set();
let userLibrary = [];
let groupAnimeIds = new Set();

const GENRE_MAP = {
  Action: "Ação",
  Adventure: "Aventura",
  Comedy: "Comédia",
  Drama: "Drama",
  Fantasy: "Fantasia",
  Horror: "Terror",
  Mystery: "Mistério",
  Romance: "Romance",
  "Sci-Fi": "Ficção Científica",
  Suspense: "Suspense",
  "Slice of Life": "Slice of Life",
  Sports: "Esportes",
  Supernatural: "Sobrenatural",
  Psychological: "Psicológico",
  Ecchi: "Ecchi",
  Mecha: "Mecha",
  Music: "Música",
  "Award Winning": "Premiado",
  Gourmet: "Culinária",
  "Boys Love": "BL",
  "Girls Love": "GL",
  Hentai: "Hentai",
  "Super Power": "Superpoderes",
  Erotica: "Hentai",
  Historical: "Histórico",
  Military: "Militar",
  Magia: "Magia",
  "Martial Arts": "Artes Marciais",
  Vampiro: "Vampiro",
  Demons: "Demônios",
  School: "Escola",
  Space: "Espaço",
  Samurai: "Samurai",
  Police: "Policial",
  Harem: "Harém",
  Game: "Jogo",
  Parody: "Paródia",
  Isekai: "Isekai",
  Seinen: "Seinen",
  Shounen: "Shounen",
};

init();

async function init() {
  currentGroupId = getGroupId();
  if (!currentGroupId) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    alert("Você precisa estar logado para sugerir animes.");
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  setupTabs();
  setupSearch();
  setupScoreStepper();
  setupCommentCounter();
  loadLibraryAndGroup();

  document.getElementById("submit-anime-button")?.addEventListener("click", handleSubmit);
  importBtn?.addEventListener("click", handleImport);

  notWatchedCheck?.addEventListener("change", (event) => {
    if (ratingFields) ratingFields.style.display = event.target.checked ? "none" : "grid";
  });

  genreFilterImport?.addEventListener("change", () => renderImportList());
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll(".tab-btn").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".suggest-panel").forEach((panel) => panel.classList.remove("active"));

      button.classList.add("active");
      document.getElementById(`panel-${button.dataset.tab}`)?.classList.add("active");
    };
  });
}

function translateGenres(apiGenres) {
  return apiGenres.map((genre) => prettyGenre(GENRE_MAP[genre] || genre));
}

function syncLinksContainerState() {
  const container = document.getElementById("links-container-rows");
  if (!container) return;
  container.classList.toggle("has-links", container.children.length > 0);
}

function setupScoreStepper() {
  if (!scoreInput) return;

  const clampScore = (value) => {
    const next = Number.parseFloat(value);
    if (Number.isNaN(next)) return 5;
    return Math.min(10, Math.max(0, next));
  };

  document.querySelectorAll("[data-score-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const currentValue = clampScore(scoreInput.value || scoreInput.defaultValue);
      const delta = button.dataset.scoreStep === "up" ? 0.1 : -0.1;
      const nextValue = clampScore((currentValue + delta).toFixed(1));
      scoreInput.value = nextValue.toFixed(1);
      scoreInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  scoreInput.addEventListener("change", () => {
    scoreInput.value = clampScore(scoreInput.value).toFixed(1);
  });
}

function setupCommentCounter() {
  if (!commentInput || !commentCounter) return;

  const updateCounter = () => {
    commentCounter.textContent = `${commentInput.value.length}/500`;
  };

  commentInput.addEventListener("input", updateCounter);
  updateCounter();
}

function setupSearch() {
  if (!animeNameInput) return;

  let timeoutId = null;

  animeNameInput.addEventListener("input", () => {
    clearTimeout(timeoutId);
    const query = animeNameInput.value.trim();

    if (query.length === 0) {
      resultsDropdown?.classList.add("hidden");
      detailsSection?.classList.add("hidden");
      manualFields?.classList.add("hidden");
      currentAnimeData = null;
      if (importBtn) importBtn.disabled = importBtn.disabled;
      const submitBtn = document.getElementById("submit-anime-button");
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    if (query.length < 3) {
      resultsDropdown?.classList.add("hidden");
      return;
    }

    timeoutId = setTimeout(() => fetchJikan(query), 500);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-container")) {
      resultsDropdown?.classList.add("hidden");
    }
  });
}

async function fetchJikan(query) {
  try {
    const response = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`,
    );

    if (!response.ok) throw new Error("Jikan offline");

    const { data } = await response.json();
    renderResults(data || [], false, false);
  } catch (_error) {
    fetchLocalSearch(query);
  }
}

async function fetchLocalSearch(query) {
  try {
    const { data, error } = await supabase
      .from("animes")
      .select("*")
      .ilike("name", `%${query}%`)
      .limit(5);

    if (error) throw error;

    const formatted = (data || []).map((anime) => ({
      mal_id: anime.mal_id,
      title: anime.name,
      images: {
        jpg: {
          image_url: anime.image_url,
          large_image_url: anime.image_url,
        },
      },
      genres: (anime.genres || []).map((genre) => ({ name: genre })),
      local: true,
    }));

    renderResults(formatted, true, false);
  } catch (_error) {
    renderResults([], true, true);
  }
}

function renderResults(list, isLocal = false, isError = false) {
  if (!resultsDropdown) return;

  resultsDropdown.innerHTML = "";
  resultsDropdown.classList.remove("hidden");

  if (isError) {
    resultsDropdown.innerHTML = `
      <li class="search-dropdown-message is-error">
        <strong>Erro de conexão</strong><br>
        O MyAnimeList está instável no momento. Tente novamente mais tarde.
      </li>
    `;
    return;
  }

  if (isLocal && list.length > 0) {
    const notice = document.createElement("li");
    notice.className = "search-dropdown-notice";
    notice.textContent = "MyAnimeList offline - mostrando resultados do banco local";
    resultsDropdown.appendChild(notice);
  } else if (isLocal && list.length === 0) {
    resultsDropdown.innerHTML = `
      <li class="search-dropdown-message is-empty">
        Nenhum anime encontrado no banco local e o MyAnimeList está fora do ar.
      </li>
    `;
    return;
  }

  list.forEach((anime) => {
    const item = document.createElement("li");
    item.className = "search-result-item";
    item.innerHTML = `
      <img src="${anime.images.jpg.image_url}" alt="${escapeHTML(anime.title)}">
      <div>
        <strong>${escapeHTML(anime.title)}</strong>
        <small>${anime.year || (anime.local ? "Banco Local" : "N/A")} - ${anime.type || "Anime"}</small>
      </div>
    `;
    item.onclick = () => selectAnime(anime);
    resultsDropdown.appendChild(item);
  });
}

function selectAnime(anime) {
  const prettyGenresList = anime.local
    ? anime.genres.map((genre) => genre.name)
    : translateGenres(anime.genres.map((genre) => genre.name));

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
    const statusMarkup = existsInGroup
      ? `<p class="anime-preview-status is-danger">Este anime já existe no acervo do grupo!</p>`
      : `<p class="anime-preview-status is-success">Pronto para sugestão</p>`;

    const genrePills = prettyGenresList
      .slice(0, 3)
      .map((genre) => `<span class="anime-preview-pill">${escapeHTML(genre)}</span>`)
      .join("");

    detailsSection.style.setProperty("--preview-image", `url("${currentAnimeData.imageUrl}")`);
    detailsSection.innerHTML = `
      <div class="anime-preview-card">
        <div class="anime-preview-media">
          <img src="${currentAnimeData.imageUrl}" alt="${escapeHTML(currentAnimeData.name)}">
        </div>
        <div class="anime-preview-copy">
          <h4 class="anime-preview-title">${escapeHTML(currentAnimeData.name)}</h4>
          <div class="anime-preview-genres">${genrePills}</div>
          ${statusMarkup}
        </div>
      </div>
    `;
    detailsSection.classList.remove("hidden");
  }

  const submitBtn = document.getElementById("submit-anime-button");
  if (submitBtn) submitBtn.disabled = existsInGroup;
}

async function handleSubmit() {
  if (!currentGroupId || !currentAnimeData) {
    alert("Selecione um anime primeiro.");
    return;
  }

  const isNotWatched = Boolean(notWatchedCheck?.checked);
  const score = isNotWatched ? null : parseFloat(scoreInput?.value || 5);
  const comment =
    commentInput?.value.trim() ||
    (isNotWatched ? "Ainda não assisti." : "Sugerido por mim.");

  const links = {};
  document.querySelectorAll(".link-input-row").forEach((row) => {
    const nameInput = row.querySelector(".link-name-input");
    const urlInput = row.querySelector(".link-url-input");
    const name = nameInput?.value.trim();
    const url = urlInput?.value.trim();
    if (name && url) links[name] = url;
  });

  try {
    await supabase.from("animes").upsert([
      {
        mal_id: currentAnimeData.malId,
        name: currentAnimeData.name,
        genres: currentAnimeData.genres,
        image_url: currentAnimeData.imageUrl,
        titles: currentAnimeData.titles,
      },
    ]);

    if (score !== null) {
      await supabase.from("user_library").upsert([
        {
          user_id: currentUser.id,
          mal_id: currentAnimeData.malId,
          last_score: score,
          last_comment: comment,
        },
      ]);
    }

    const { error } = await supabase.from("group_animes").insert([
      {
        group_id: currentGroupId,
        mal_id: currentAnimeData.malId,
        added_by: currentUser.id,
        status: "pending",
        links,
      },
    ]);

    if (error) {
      if (error.code === "23505") {
        alert("Este anime já existe no acervo do grupo!");
        return;
      }
      throw error;
    }

    await supabase.from("votes").insert([
      {
        group_id: currentGroupId,
        mal_id: currentAnimeData.malId,
        user_id: currentUser.id,
        score,
        comment,
      },
    ]);

    alert("Sugerido com sucesso!");
    window.location.href = `pending.html#g=${currentGroupId}`;
  } catch (error) {
    alert(`Erro: ${error.message}`);
  }
}

async function loadLibraryAndGroup() {
  try {
    const { data: groupAnimes } = await supabase
      .from("group_animes")
      .select("mal_id")
      .eq("group_id", currentGroupId);

    groupAnimeIds = new Set((groupAnimes || []).map((anime) => anime.mal_id));

    const { data: library, error } = await supabase
      .from("user_library")
      .select("*, animes(*)")
      .eq("user_id", currentUser.id)
      .order("last_score", { ascending: false, nullsFirst: false });

    if (error) throw error;
    userLibrary = library || [];

    const genres = new Set();
    userLibrary.forEach((item) => {
      (item.animes?.genres || []).forEach((genre) => genres.add(genre));
    });

    if (genreFilterImport) {
      genreFilterImport.innerHTML =
        '<option value="">Todos os gêneros</option>' +
        Array.from(genres)
          .sort()
          .map((genre) => `<option value="${genre}">${genre}</option>`)
          .join("");
    }

    renderImportList();
  } catch (_error) {
    if (importContainer) {
      importContainer.innerHTML = '<p class="import-empty-state">Histórico vazio.</p>';
    }
  }
}

function renderImportList() {
  if (!importContainer) return;

  if (userLibrary.length === 0) {
    importContainer.innerHTML = '<p class="import-empty-state">Histórico vazio.</p>';
    return;
  }

  const genre = genreFilterImport?.value;
  const filtered = userLibrary.filter((item) => {
    if (!genre) return true;
    return (item.animes?.genres || []).includes(genre);
  });

  importContainer.innerHTML = filtered
    .map((item) => {
      const anime = item.animes;
      if (!anime) return "";

      const exists = groupAnimeIds.has(anime.mal_id);
      const thumb = anime.image_url || "assets/placeholder.png";
      const isChecked = selectedToImport.has(anime.mal_id);
      const scoreText = item.last_score !== null ? Number(item.last_score).toFixed(1) : "-";

      return `
        <label class="import-item ${exists ? "exists" : ""}">
          <input type="checkbox"
                 ${exists ? "disabled" : ""}
                 ${isChecked ? "checked" : ""}
                 onchange="window.toggleSelectImport('${anime.mal_id}', this.checked)">
          <img src="${thumb}" alt="${escapeHTML(anime.name)}" onerror="this.src='assets/placeholder.png'">
          <div class="import-item-info">
            <strong>${escapeHTML(anime.name)}</strong>
            <p class="import-score-copy">Sua nota: ${scoreText}</p>
          </div>
          ${exists ? '<div class="import-item-flag">NO ACERVO</div>' : ""}
        </label>
      `;
    })
    .join("");

  updateImportButton();
}

window.toggleSelectImport = (malId, checked) => {
  const id = Number.parseInt(malId, 10);
  if (checked) selectedToImport.add(id);
  else selectedToImport.delete(id);
  updateImportButton();
};

window.selectAllImport = () => {
  const genre = genreFilterImport?.value;
  const availableItems = userLibrary.filter((item) => {
    const exists = groupAnimeIds.has(item.mal_id);
    const matchesGenre = !genre || (item.animes?.genres || []).includes(genre);
    return !exists && matchesGenre;
  });

  if (availableItems.length === 0) return;

  const allAlreadySelected = availableItems.every((item) => selectedToImport.has(item.mal_id));

  if (allAlreadySelected) {
    availableItems.forEach((item) => selectedToImport.delete(item.mal_id));
  } else {
    availableItems.forEach((item) => selectedToImport.add(item.mal_id));
  }

  renderImportList();
};

function updateImportButton() {
  if (!importBtn) return;

  const hasSelection = selectedToImport.size > 0;
  importBtn.disabled = !hasSelection;
  importBtn.textContent = `Importar Selecionados (${selectedToImport.size})`;

  if (hasSelection) {
    importBtn.style.background = "rgba(139, 92, 246, 0.2)";
    importBtn.style.borderColor = "var(--accent)";
    importBtn.style.color = "white";
    importBtn.style.boxShadow = "0 0 20px rgba(139, 92, 246, 0.2)";
  } else {
    importBtn.style.background = "rgba(255, 255, 255, 0.05)";
    importBtn.style.borderColor = "rgba(255, 255, 255, 0.1)";
    importBtn.style.color = "var(--muted)";
    importBtn.style.boxShadow = "none";
  }
}

async function handleImport() {
  if (selectedToImport.size === 0 || !importBtn) return;

  importBtn.disabled = true;
  importBtn.textContent = "Importando...";

  const ids = Array.from(selectedToImport);
  let successCount = 0;
  const errors = [];

  for (const malId of ids) {
    const historical = userLibrary.find((item) => item.mal_id === malId);
    if (!historical) continue;

    try {
      const { error: groupError } = await supabase.from("group_animes").insert([
        {
          group_id: currentGroupId,
          mal_id: malId,
          added_by: currentUser.id,
          status: "pending",
        },
      ]);

      if (groupError) {
        if (groupError.code !== "23505") throw groupError;
      } else {
        if (historical.last_score !== null) {
          await supabase.from("votes").insert([
            {
              group_id: currentGroupId,
              mal_id: malId,
              user_id: currentUser.id,
              score: historical.last_score,
              comment: historical.last_comment || "Importado do meu histórico.",
            },
          ]);
        }
        successCount += 1;
      }
    } catch (error) {
      errors.push(`${historical.animes?.name || malId}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    alert(`Importação concluída com avisos:\n${successCount} sucesso(s)\n${errors.length} erro(s).`);
  } else {
    alert(`${successCount} animes importados com sucesso para a fila de aprovação!`);
  }

  window.location.href = `pending.html#g=${currentGroupId}`;
}

window.addNewLinkRow = () => {
  const container = document.getElementById("links-container-rows");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "link-input-row";
  row.innerHTML = `
    <input type="text" placeholder="Nome (ex: Opening 1)" class="link-name-input">
    <input type="url" placeholder="https://..." class="link-url-input">
    <button type="button" class="btn-remove-link">x</button>
  `;

  row.querySelector(".btn-remove-link")?.addEventListener("click", () => {
    row.remove();
    syncLinksContainerState();
  });

  container.appendChild(row);
  syncLinksContainerState();
};
