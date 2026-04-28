import {
  PEOPLE,
  PERSON_LIGHTS,
  animesOf,
  avgNota,
  favoriteGenre,
  formatNota,
  getPersonNota,
  loadData,
  mostControversial,
  topGenres,
} from "./data.js";

const OPENINGS = {
  Rafael: ["again", "Unravel", "Gurenge"],
  Fernando: ["Departure!", "Haruka Kanata", "Kaikai Kitan"],
  Dudu: ["The Rumbling", "Blue Bird", "Silhouette"],
  Hacksuya: ["Kyouran Hey Kids!!", "Inferno", "Kick Back"],
};

const NEWS_PLACEHOLDER = [
  {
    source: "Anime News API",
    title: "Endpoint de notícias pronto para conectar",
    summary: "O blog já está preparado para receber título, resumo, fonte e link externo.",
    url: "#",
  },
  {
    source: "Temporada",
    title: "Estreias, continuações e trailers",
    summary: "A seção pode virar um feed automático com novidades da temporada.",
    url: "#",
  },
  {
    source: "Radar RD",
    title: "Pautas internas do grupo",
    summary: "Também dá para misturar posts próprios com notícias vindas da API.",
    url: "#",
  },
];

const HERO_IMAGE_FALLBACKS = {
  52991: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg",
};

function topAnimesByPerson(animes, person) {
  return animesOf(animes, person)
    .filter((anime) => getPersonNota(anime, person) !== null)
    .sort((a, b) => getPersonNota(b, person) - getPersonNota(a, person))
    .slice(0, 3);
}

function sharedTop(animes) {
  return [...animes]
    .filter((anime) => anime.nota !== null && anime.qtdVotos > 1)
    .sort((a, b) => Number(b.nota) - Number(a.nota))
    .slice(0, 6);
}

function shortName(name, size = 44) {
  return name.length > size ? `${name.slice(0, size - 1)}...` : name;
}

async function getAnimeHeroImage(anime) {
  if (!anime?.malId) return "";
  if (HERO_IMAGE_FALLBACKS[anime.malId]) return HERO_IMAGE_FALLBACKS[anime.malId];
  const cacheKey = `jikan-hero-image-${anime.malId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;

  let imageUrl = "";
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${encodeURIComponent(anime.malId)}`);
    if (!res.ok) return "";
    const payload = await res.json();
    imageUrl =
      payload?.data?.images?.webp?.large_image_url ||
      payload?.data?.images?.jpg?.large_image_url ||
      payload?.data?.images?.webp?.image_url ||
      payload?.data?.images?.jpg?.image_url ||
      "";
  } catch {
    return "";
  }

  if (imageUrl) {
    try {
      localStorage.setItem(cacheKey, imageUrl);
    } catch {}
  }

  return imageUrl;
}

async function renderHero(data) {
  const date = new Date(data.updatedAt);
  const top = sharedTop(data.animes)[0];
  const heroImage = await getAnimeHeroImage(top);
  document.getElementById("home-subtitle").textContent =
    `${data.total} animes catalogados, atualizado em ${date.toLocaleDateString("pt-BR")}. Um blog para transformar nota, treta e recomendação em leitura.`;

  const heroPanel = document.getElementById("hero-panel");
  if (heroImage) {
    heroPanel.style.background = `
      linear-gradient(180deg, rgba(16,16,20,0.5), rgba(16,16,20,0.8)),
      linear-gradient(90deg, rgba(16,16,20,0.76), rgba(16,16,20,0.3)),
      url("${heroImage}")
    `;
    heroPanel.style.backgroundPosition = "center";
    heroPanel.style.backgroundSize = "cover";
    heroPanel.classList.add("has-bg");
  }

  heroPanel.innerHTML = `
    <span class="post-kicker">Destaque do acervo</span>
    <h2>${top ? top.nome : "Base carregada"}</h2>
    <p>${top ? `Nota geral ${formatNota(top.nota)} com ${top.qtdVotos} votos no grupo.` : "Assim que houver dados, o destaque aparece aqui."}</p>
    <a href="acervo.html">Ler no acervo</a>
  `;
}

function renderFeaturedPost(animes) {
  const top = sharedTop(animes)[0];
  const genre = topGenres(animes, 1)[0]?.[0] || "Ranking";

  document.getElementById("featured-post").innerHTML = `
    <span class="post-kicker">${genre}</span>
    <h2>${top ? `${top.nome}: o consenso atual do grupo` : "O anime mais querido do acervo"}</h2>
    <p>
      A nota coletiva ajuda a separar hype de favorito real. Este destaque usa apenas animes
      com mais de um voto para valorizar consenso, discordância e gosto compartilhado.
    </p>
    <div class="post-meta">
      <span>${top ? `${formatNota(top.nota)} de média` : "Sem nota"}</span>
      <span>${top ? `${top.qtdVotos} votos` : "0 votos"}</span>
      <span>Acervo RD</span>
    </div>
    <a class="post-link" href="acervo.html">Abrir acervo completo</a>
  `;
}

function renderMemberPosts(animes) {
  document.getElementById("member-grid").innerHTML = PEOPLE.map((person) => {
    const topAnimes = topAnimesByPerson(animes, person);
    const watched = animesOf(animes, person);
    const controversial = mostControversial(animes, person);
    const avg = avgNota(animes, person);
    const color = PERSON_LIGHTS[person];

    return `
      <article class="post-card" style="--member-color:${color}">
        <span class="post-kicker">${person}</span>
        <h3><span>Top 3</span>${person}</h3>
        <p>${watched.length} animes vistos, média ${avg ? avg.toFixed(2) : "--"} e gênero mais recorrente: ${favoriteGenre(animes, person)}.</p>
        <ol>
          ${topAnimes.map((anime) => `
            <li>
              <span>${shortName(anime.nome, 36)}</span>
              <strong>${formatNota(getPersonNota(anime, person))}</strong>
            </li>
          `).join("") || "<li><span>Sem notas ainda</span><strong>--</strong></li>"}
        </ol>
        <div class="post-tags">
          ${(OPENINGS[person] || []).slice(0, 2).map((opening) => `<span>${opening}</span>`).join("")}
          <span>${controversial ? `hot take: ${shortName(controversial.nome, 18)}` : "sem controvérsia"}</span>
        </div>
        <a href="${person.toLowerCase()}.html">Abrir perfil</a>
      </article>
    `;
  }).join("");
}

function renderPulse(animes) {
  const hottest = [...animes]
    .filter((anime) => anime.controversia !== null)
    .sort((a, b) => b.controversia - a.controversia)
    .slice(0, 5);

  document.getElementById("pulse-card").innerHTML = `
    <span class="eyebrow">Mais controversos</span>
    <h2>Onde a conversa esquenta</h2>
    <div class="hot-list">
      ${hottest.map((anime) => `
        <a href="acervo.html" title="${anime.nome}">
          <span>${shortName(anime.nome, 30)}</span>
          <strong>${anime.controversia.toFixed(1)}</strong>
        </a>
      `).join("")}
    </div>
  `;
}

function renderNews() {
  document.getElementById("news-grid").innerHTML = NEWS_PLACEHOLDER.map((item) => `
    <article class="news-card">
      <span class="news-source">${item.source}</span>
      <h3>${item.title}</h3>
      <p>${item.summary}</p>
      <a href="${item.url}" ${item.url === "#" ? 'aria-disabled="true"' : ""}>Ler notícia</a>
    </article>
  `).join("");
}

async function init() {
  const data = await loadData();
  await renderHero(data);
  renderFeaturedPost(data.animes);
  renderMemberPosts(data.animes);
  renderPulse(data.animes);
  renderNews();
}

init().catch((error) => {
  console.error(error);
  document.getElementById("home-subtitle").textContent = "Não foi possível carregar os dados agora.";
});
