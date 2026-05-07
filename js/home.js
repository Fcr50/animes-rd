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
} from "./data.js?v=desafios-soft-1";
import { escapeHTML, shortText, shuffleItems } from "./utils.js";

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const _app  = getApps()[0] || initializeApp(firebaseConfig);
const _db   = getFirestore(_app);
const _auth = getAuth(_app);

// Fallback de openings (sem URL)
const OPENINGS_DEFAULT = {
  Rafael:   [{ name: "again", url: "" }, { name: "Unravel", url: "" }, { name: "Gurenge", url: "" }],
  Fernando: [{ name: "Departure!", url: "" }, { name: "Haruka Kanata", url: "" }, { name: "Kaikai Kitan", url: "" }],
  Dudu:     [{ name: "The Rumbling", url: "" }, { name: "Blue Bird", url: "" }, { name: "Silhouette", url: "" }],
  Hacksuya: [{ name: "Kyouran Hey Kids!!", url: "" }, { name: "Inferno", url: "" }, { name: "Kick Back", url: "" }],
  Zana:     [{ name: "Guren no Yumiya", url: "" }, { name: "Bling-Bang-Bang-Born", url: "" }, { name: "Colors", url: "" }],
};

// Cache de openings carregadas do Firestore
let openingsCache = { ...OPENINGS_DEFAULT };
let currentPersonName = null;

async function loadOpenings() {
  for (const person of PEOPLE) {
    try {
      const snap = await getDoc(doc(_db, "member_openings", person));
      if (snap.exists()) {
        openingsCache[person] = snap.data().openings || OPENINGS_DEFAULT[person];
      }
    } catch {}
  }
}

async function saveOpenings(person, openings) {
  await setDoc(doc(_db, "member_openings", person), { openings });
  openingsCache[person] = openings;
}

// Escuta auth para saber quem está logado
onAuthStateChanged(_auth, (user) => {
  if (user) {
    currentPersonName = localStorage.getItem(`user-${user.uid}-personName`) || null;
  } else {
    currentPersonName = null;
  }
});

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
  49730: "https://myanimelist.net/images/anime/1787/140239l.webp",
  52991: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg",
  50265: "https://cdn.myanimelist.net/images/anime/1441/122795l.jpg",
};

const FEATURED_ROTATION_MINUTES = 30;
const FEATURED_ROTATION_SALT = "featured-swap-2025-may";
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
        <p>${escapeHTML(shortText(comment.text, 112))}</p>
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
  for (let index = 0; index < shuffledComments.length; index += 8) {
    batches.push(shuffledComments.slice(index, index + 8));
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
      for (let nextIndex = 0; nextIndex < reshuffled.length; nextIndex += 8) {
        batches.push(reshuffled.slice(nextIndex, nextIndex + 8));
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
    heroPanel.style.setProperty("--hero-anime-bg", `url("${heroImage}")`);
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

function renderOpeningChips(person) {
  const ops = (openingsCache[person] || OPENINGS_DEFAULT[person] || []).slice(0, 3);
  const canEdit = currentPersonName === person;
  return ops.map((op, i) => {
    const name = typeof op === "string" ? op : op.name;
    const url  = typeof op === "string" ? "" : op.url;
    const chip = url
      ? `<a class="opening-chip" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer"><b>${String(i + 1).padStart(2, "0")}</b>${escapeHTML(name)}</a>`
      : `<span class="opening-chip"><b>${String(i + 1).padStart(2, "0")}</b>${escapeHTML(name)}</span>`;
    const editBtn = canEdit
      ? `<button class="opening-edit-btn" onclick="window.editOpening('${escapeHTML(person)}',${i})" title="Editar">✎</button>`
      : "";
    return `<div class="opening-chip-wrap">${chip}${editBtn}</div>`;
  }).join("");
}

window.editOpening = function (person, index) {
  const ops = (openingsCache[person] || OPENINGS_DEFAULT[person] || []).slice(0, 3);
  const current = ops[index] || { name: "", url: "" };
  const name = typeof current === "string" ? current : current.name;
  const url  = typeof current === "string" ? "" : current.url;

  const wrap = document.getElementById(`openings-${person}`);
  if (!wrap) return;

  // Remove form anterior se existir
  document.querySelectorAll(".opening-inline-form").forEach((el) => el.remove());

  const form = document.createElement("div");
  form.className = "opening-inline-form";
  form.innerHTML = `
    <input class="opening-form-input" id="op-name-${index}" type="text" placeholder="Nome da opening" value="${escapeHTML(name)}" maxlength="80" />
    <input class="opening-form-input" id="op-url-${index}"  type="url"  placeholder="URL (opcional)" value="${escapeHTML(url)}" maxlength="300" />
    <div class="opening-form-actions">
      <button class="opening-save-btn" id="op-save-${index}">Salvar</button>
      <button class="opening-cancel-btn" onclick="this.closest('.opening-inline-form').remove()">Cancelar</button>
    </div>
    <span class="opening-form-status" id="op-status-${index}"></span>
  `;
  wrap.after(form);

  document.getElementById(`op-save-${index}`).addEventListener("click", async () => {
    const newName = document.getElementById(`op-name-${index}`).value.trim();
    const newUrl  = document.getElementById(`op-url-${index}`).value.trim();
    const statusEl = document.getElementById(`op-status-${index}`);
    if (!newName) { statusEl.textContent = "Nome obrigatório."; return; }

    const btn = document.getElementById(`op-save-${index}`);
    btn.disabled = true;
    statusEl.textContent = "Salvando...";

    const newOps = (openingsCache[person] || OPENINGS_DEFAULT[person] || []).slice(0, 3).map((op, i2) => {
      if (i2 === index) return { name: newName, url: newUrl };
      return typeof op === "string" ? { name: op, url: "" } : op;
    });

    try {
      await saveOpenings(person, newOps);
      form.remove();
      const listEl = document.getElementById(`openings-${person}`);
      if (listEl) listEl.innerHTML = renderOpeningChips(person);
    } catch (e) {
      statusEl.textContent = "Erro ao salvar.";
      btn.disabled = false;
    }
  });
};

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
          <div class="opening-list" id="openings-${person}">
            ${renderOpeningChips(person)}
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

async function renderNews() {
  const grid = document.getElementById("news-grid");
  if (!grid) return;

  const BLOCK_MS = 5 * 60 * 60 * 1000;
  const block = Math.floor(Date.now() / BLOCK_MS);
  const cacheKey = `gnews-anime-v4-${block}`;

  let items = null;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      items = JSON.parse(cached);
    } else {
      const rssUrl = encodeURIComponent(
        "https://news.google.com/rss/search?q=anime&hl=en-US&gl=US&ceid=US:en",
      );
      const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=10`);
      if (!res.ok) throw new Error("rss failed");
      const payload = await res.json();

      // Extrai o nome do anime/tópico principal do título (primeiras 2 palavras)
      function topicKey(title) {
        return title
          .toLowerCase()
          .split(/[\s:,\-–|]/g)
          .filter(Boolean)
          .slice(0, 2)
          .join(" ");
      }

      const seenTopics = new Set();
      items = (payload.items || [])
        .filter((item) => {
          if (!item.title || !item.link) return false;
          const key = topicKey(item.title);
          if (seenTopics.has(key)) return false;
          seenTopics.add(key);
          return true;
        })
        .slice(0, 3)
        .map((item) => ({
          source: item.author || "Google News",
          title: item.title.replace(/ - .*$/, ""),
          excerpt: item.description ? item.description.replace(/<[^>]*>/g, "").slice(0, 160) : "",
          url: item.link,
          date: item.pubDate
            ? new Date(item.pubDate).toLocaleDateString("pt-BR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "",
        }));

      if (items.length) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(items));
        } catch {}
      }
    }
  } catch {}

  if (!items || !items.length) {
    grid.innerHTML = NEWS_PLACEHOLDER.map(
      (item) => `
      <article class="news-card">
        <span class="news-source">${item.source}</span>
        <h3>${item.title}</h3>
        <p>${item.summary}</p>
        <a href="${item.url}" aria-disabled="true">Aguardando endpoint</a>
      </article>`,
    ).join("");
    return;
  }

  grid.innerHTML = items
    .map(
      (item) => `
    <article class="news-card">
      <span class="news-source">${escapeHTML(item.source)}</span>
      ${item.date ? `<span class="news-date">${item.date}</span>` : ""}
      <h3>${escapeHTML(item.title)}</h3>
      <p>${escapeHTML(item.excerpt)}${item.excerpt.length >= 160 ? "…" : ""}</p>
      <a href="${item.url}" target="_blank" rel="noopener noreferrer">Ler notícia</a>
    </article>`,
    )
    .join("");
}

const SCHEDULE_DAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const SCHEDULE_DAYS_EN = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

async function renderCalendar() {
  const card = document.getElementById("calendar-card");
  if (!card) return;

  const today = new Date();
  const dayIndex = today.getDay();
  const dayEn = SCHEDULE_DAYS_EN[dayIndex];
  const dayPt = SCHEDULE_DAYS_PT[dayIndex];
  const dateStr = today.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  const cacheKey = `jikan-schedule-brt7-${dayEn}-${today.toISOString().slice(0, 10)}`;

  function jstToBrt(timeStr) {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return "";
    // JST = UTC+9, BRT = UTC-3 → subtract 12h
    let brtH = (h - 12 + 24) % 24;
    return `${String(brtH).padStart(2, "0")}:${String(m).padStart(2, "0")} BRT`;
  }

  let items = null;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      items = JSON.parse(cached);
    } else {
      const res = await fetch(
        `https://api.jikan.moe/v4/schedules?filter=${dayEn}&limit=25&sfw=true`,
      );
      if (res.ok) {
        const payload = await res.json();
        const seen = new Set();
        items = (payload.data || [])
          .filter((a) => {
            const key = a.mal_id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 7);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(items));
        } catch {}
      }
    }
  } catch {}

  if (!items || !items.length) {
    card.innerHTML = `
      <span class="eyebrow">Calendário MAL</span>
      <h2>No ar hoje</h2>
      <p class="calendar-empty">Não foi possível carregar os lançamentos agora.</p>
    `;
    return;
  }

  card.innerHTML = `
    <span class="eyebrow">Calendário MAL</span>
    <h2>No ar hoje</h2>
    <p class="calendar-day">${dayPt.charAt(0).toUpperCase() + dayPt.slice(1)} · ${dateStr}</p>
    <div class="calendar-list">
      ${items
        .map((anime) => {
          const time = jstToBrt(anime.broadcast?.time);
          const href = `https://myanimelist.net/anime/${anime.mal_id}`;
          const title = anime.title_english || anime.title || "";
          return `
          <a class="calendar-item" href="${href}" target="_blank" rel="noopener noreferrer">
            <span class="calendar-dot"></span>
            <span class="calendar-title">${title}</span>
            ${time ? `<span class="calendar-time">${time}</span>` : ""}
          </a>`;
        })
        .join("")}
    </div>
    <a class="calendar-mal-link" href="https://myanimelist.net/anime/season" target="_blank" rel="noopener noreferrer">Ver temporada completa →</a>
  `;
}

window.scrollMemberGrid = function (dir) {
  const grid = document.getElementById("member-grid");
  if (!grid) return;
  const card = grid.querySelector(".post-card");
  const cardWidth = card ? card.offsetWidth + 18 : 300;
  grid.scrollBy({ left: dir * cardWidth, behavior: "smooth" });
};

async function init() {
  const data = await loadData();
  await loadOpenings();
  await renderHero(data);
  renderFeaturedPost(data.animes);
  renderMemberPosts(data.animes);
  renderPulse(data.animes);
  renderNews();
  renderCalendar();
}

init().catch((error) => {
  console.error(error);
  document.getElementById("home-subtitle").textContent =
    "Não foi possível carregar os dados agora.";
});
