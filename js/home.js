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
} from "./data.js?v=featured-30min-1";
import { escapeHTML, shortText, shuffleItems } from "./utils.js";

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

const FEATURED_ROTATION_MINUTES = 30;
const FEATURED_ROTATION_SALT = "thirty-minute-rotation-1";
const YOUTUBE_PLAYLIST_URL =
  "https://youtube.com/playlist?list=PLjNlQ2vXx1xbt30X8TcUfNzw_akVISXEu&si=sjrgOdNP3MwdhC6D";
const SPOTIFY_PLAYLIST_URL =
  "https://open.spotify.com/playlist/2Uz95kBY93CizCzICWnx3d?si=ae6d73f6c6934528";
const MAL_NEWS_URL = "https://myanimelist.net/news";

let featuredCommentTimer = null;
let heroInfoTimer = null;

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

function hashText(value) {
  return String(value)
    .split("")
    .reduce((hash, char) => {
      return ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    }, 0);
}

function featuredAnimeForNow(animes) {
  const candidates = [...animes]
    .filter((anime) => Number(anime.nota) > 9)
    .sort((a, b) => String(a.id || a.nome).localeCompare(String(b.id || b.nome)));

  if (!candidates.length) return sharedTop(animes)[0];

  const rotationMs = FEATURED_ROTATION_MINUTES * 60 * 1000;
  const rotationBlock = Math.floor(Date.now() / rotationMs);
  const seed = Math.abs(hashText(`animes-rd-featured-${FEATURED_ROTATION_SALT}-${rotationBlock}`));
  return candidates[seed % candidates.length];
}

function commentsForAnime(anime) {
  if (Array.isArray(anime?.comments) && anime.comments.length) {
    return anime.comments
      .filter((comment) => comment?.text)
      .map((comment) => ({
        animeId: anime.id,
        anime: anime.nome,
        person: comment.person || "Comentário",
        text: comment.text,
      }));
  }

  if (!anime?.comentarios) return [];

  const peoplePattern = PEOPLE.join("|");
  const linePattern = new RegExp(`^\\s*(${peoplePattern})\\s*[:\\-–—]\\s*(.+)$`, "i");

  return String(anime.comentarios)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(linePattern);
      if (!match)
        return {
          animeId: anime.id,
          anime: anime.nome,
          person: "Comentário",
          text: line,
        };
      const person =
        PEOPLE.find((name) => name.toLowerCase() === match[1].toLowerCase()) || match[1];
      return {
        animeId: anime.id,
        anime: anime.nome,
        person,
        text: match[2].trim(),
      };
    })
    .filter((comment) => comment.text);
}

function featuredComments(animes, featuredAnime) {
  const mainComments = commentsForAnime(featuredAnime);
  const otherComments = animes.flatMap((anime) => commentsForAnime(anime));

  return shuffleItems(
    [...mainComments, ...otherComments].filter(
      (comment, index, list) =>
        list.findIndex(
          (item) =>
            item.animeId === comment.animeId &&
            item.person === comment.person &&
            item.text === comment.text,
        ) === index,
    ),
  );
}

function renderCommentBalloons(comments) {
  return comments
    .map((comment, index) => {
      const personColor = PERSON_LIGHTS[comment.person] || "var(--dudu-light)";
      const href = `acervo.html?anime=${encodeURIComponent(comment.animeId || "")}`;
      return `
      <a class="comment-balloon comment-balloon-${index + 1}" href="${href}" style="--balloon-color:${personColor}" title="Abrir ${escapeHTML(comment.anime)} no acervo">
        <strong>${escapeHTML(comment.person)}</strong>
        <p>${escapeHTML(shortText(comment.text, 120))}</p>
      </a>
    `;
    })
    .join("");
}

function startFeaturedCommentRotation(comments) {
  const wall = document.getElementById("featured-comments");
  if (!wall) return;

  if (featuredCommentTimer) {
    clearInterval(featuredCommentTimer);
    featuredCommentTimer = null;
  }

  const batches = [];
  const shuffledComments = shuffleItems(comments);
  for (let index = 0; index < shuffledComments.length; index += 6) {
    batches.push(shuffledComments.slice(index, index + 6));
  }

  if (!batches.length) {
    wall.innerHTML = "";
    wall.hidden = true;
    return;
  }

  let index = 0;
  const renderBatch = () => {
    wall.hidden = false;
    wall.innerHTML = renderCommentBalloons(batches[index]);
    index = (index + 1) % batches.length;
    if (index === 0 && batches.length > 1) {
      const reshuffled = shuffleItems(comments);
      batches.splice(0, batches.length);
      for (let nextIndex = 0; nextIndex < reshuffled.length; nextIndex += 6) {
        batches.push(reshuffled.slice(nextIndex, nextIndex + 6));
      }
    }
  };

  renderBatch();
  if (batches.length > 1) {
    featuredCommentTimer = setInterval(renderBatch, 12000);
  }
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

function renderHeroInfoRotator(data, date, featuredAnime) {
  const rotator = document.getElementById("blog-hero-rotator");
  if (!rotator) return;

  if (heroInfoTimer) {
    clearInterval(heroInfoTimer);
    heroInfoTimer = null;
  }

  const subtitle = `${data.total} animes catalogados, atualizado em ${date.toLocaleDateString("pt-BR")}. Um blog para transformar nota, treta e recomendacao em leitura.`;
  const featuredTitle = featuredAnime?.nome || "o proximo anime";
  const featuredHref = featuredAnime?.id
    ? `acervo.html?anime=${encodeURIComponent(featuredAnime.id)}`
    : "acervo.html";

  const slides = [
    {
      tone: "blog",
      eyebrow: `Blog <span class="brand-gradient">Animes RD</span>`,
      title: "Criticas, rankings e guias para decidir o proximo anime.",
      text: subtitle,
      visuals: [],
    },
    {
      tone: "playlists",
      eyebrow: "Playlists do grupo",
      title: "Openings para deixar tocando enquanto escolhe.",
      text: "Duas playlists pra entrar no clima: YouTube e Spotify, com a vibe do Animes RD.",
      visuals: [
        {
          label: "YouTube",
          src: "https://cdn.simpleicons.org/youtube/FF0033",
          href: YOUTUBE_PLAYLIST_URL,
        },
        {
          label: "Spotify",
          src: "https://cdn.simpleicons.org/spotify/1ED760",
          href: SPOTIFY_PLAYLIST_URL,
        },
      ],
    },
    {
      tone: "news",
      eyebrow: "Noticias",
      title: "Radar MyAnimeList para novidades da temporada.",
      text: "Um atalho para acompanhar anuncios, trailers, estreias e movimentacoes do mundo dos animes.",
      visuals: [
        {
          label: "MyAnimeList",
          src: "https://cdn.simpleicons.org/myanimelist/2E51A2",
          href: MAL_NEWS_URL,
        },
      ],
    },
    {
      tone: "featured",
      eyebrow: "Dica em destaque",
      title: `Hoje o acervo esta puxando: ${featuredTitle}.`,
      text: featuredAnime
        ? `Nota geral ${formatNota(featuredAnime.nota)} com ${featuredAnime.qtdVotos} votos no grupo.`
        : "Assim que houver dados, a recomendacao aparece por aqui.",
      visuals: [],
    },
  ];

  rotator.innerHTML = `
    ${slides
      .map(
        (slide, index) => `
      <section class="blog-hero-slide ${index === 0 ? "active" : ""}" data-hero-slide="${index}" data-hero-tone="${slide.tone}">
        <div class="blog-hero-slide-copy">
          <span class="eyebrow">${slide.eyebrow}</span>
          <h1>${escapeHTML(slide.title)}</h1>
          <p ${index === 0 ? 'id="home-subtitle"' : ""}>${escapeHTML(slide.text)}</p>
        </div>
        ${
          slide.visuals.length
            ? `
          <div class="blog-hero-slide-footer">
            <div class="blog-hero-visual" aria-hidden="true">
              ${slide.visuals
                .map(
                  (visual) => `
                <a href="${escapeHTML(visual.href)}" ${visual.href.startsWith("http") ? 'target="_blank" rel="noopener noreferrer"' : ""} title="${escapeHTML(visual.label)}" aria-label="${escapeHTML(visual.label)}">
                  <img src="${escapeHTML(visual.src)}" alt="" />
                </a>
              `,
                )
                .join("")}
            </div>
          </div>
        `
            : ""
        }
      </section>
    `,
      )
      .join("")}
    <div class="blog-hero-dots">
      ${slides.map((_, index) => `<button class="${index === 0 ? "active" : ""}" type="button" data-hero-dot="${index}" aria-label="Abrir aba ${index + 1}"></button>`).join("")}
    </div>
  `;

  let active = 0;
  const host = rotator.closest(".blog-hero-copy");
  host?.setAttribute("data-hero-tone", slides[0].tone);
  const showSlide = (next) => {
    const slideEls = rotator.querySelectorAll("[data-hero-slide]");
    const dots = rotator.querySelectorAll("[data-hero-dot]");
    slideEls[active]?.classList.remove("active");
    dots[active]?.classList.remove("active");
    active = (next + slideEls.length) % slideEls.length;
    slideEls[active]?.classList.add("active");
    dots[active]?.classList.add("active");
    host?.setAttribute("data-hero-tone", slides[active].tone);
  };

  const restartTimer = () => {
    if (heroInfoTimer) clearInterval(heroInfoTimer);
    heroInfoTimer = setInterval(() => showSlide(active + 1), 10000);
  };

  rotator.querySelectorAll("[data-hero-dot]").forEach((dot) => {
    dot.addEventListener("click", () => {
      showSlide(Number(dot.dataset.heroDot || 0));
      restartTimer();
    });
  });

  restartTimer();
}

async function renderHero(data) {
  const date = new Date(data.updatedAt);
  const top = featuredAnimeForNow(data.animes);
  const heroImage = await getAnimeHeroImage(top);
  renderHeroInfoRotator(data, date, top);
  document.getElementById("home-subtitle").textContent =
    `${data.total} animes catalogados, atualizado em ${date.toLocaleDateString("pt-BR")}. Um blog para transformar nota, treta e recomendação em leitura.`;

  const heroPanel = document.getElementById("hero-panel");
  if (heroImage) {
    heroPanel.style.background = `
      linear-gradient(180deg, rgba(16,16,20,0.34), rgba(16,16,20,0.66)),
      linear-gradient(90deg, rgba(16,16,20,0.58), rgba(16,16,20,0.16)),
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
    <a href="${top?.id ? `acervo.html?anime=${encodeURIComponent(top.id)}` : "acervo.html"}">Ler no acervo</a>
  `;
}

function renderFeaturedPost(animes) {
  const top = sharedTop(animes)[0];
  const comments = featuredComments(animes, top);

  document.getElementById("featured-post").innerHTML = `
    <h2 class="featured-comment-title">Comentários</h2>
    <div class="featured-comment-wall" id="featured-comments" aria-live="polite"></div>
  `;

  startFeaturedCommentRotation(comments);
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
        <h3><span>Top 3</span>${person}</h3>
        <p>${watched.length} animes vistos, média ${avg ? avg.toFixed(2) : "--"} e gênero mais recorrente: ${favoriteGenre(animes, person)}.</p>
        <ol>
          ${
            topAnimes
              .map(
                (anime) => `
            <li>
              <span>${shortText(anime.nome, 36)}</span>
              <strong>${formatNota(getPersonNota(anime, person))}</strong>
            </li>
          `,
              )
              .join("") || "<li><span>Sem notas ainda</span><strong>--</strong></li>"
          }
        </ol>
        <div class="post-tags post-openings" aria-label="Top 3 openings de ${person}">
          <strong>Top 3 openings</strong>
          <div class="opening-list">
            ${(OPENINGS[person] || [])
              .slice(0, 3)
              .map(
                (opening, index) => `
              <span><b>${String(index + 1).padStart(2, "0")}</b>${opening}</span>
            `,
              )
              .join("")}
          </div>
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
      ${hottest
        .map(
          (anime) => `
        <a href="acervo.html" title="${anime.nome}">
          <span>${shortText(anime.nome, 30)}</span>
          <strong>${anime.controversia.toFixed(1)}</strong>
        </a>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderNews() {
  document.getElementById("news-grid").innerHTML = NEWS_PLACEHOLDER.map(
    (item) => `
    <article class="news-card">
      <span class="news-source">${item.source}</span>
      <h3>${item.title}</h3>
      <p>${item.summary}</p>
      <a href="${item.url}" ${item.url === "#" ? 'aria-disabled="true"' : ""}>Ler notícia</a>
    </article>
  `,
  ).join("");
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
  document.getElementById("home-subtitle").textContent =
    "Não foi possível carregar os dados agora.";
});
