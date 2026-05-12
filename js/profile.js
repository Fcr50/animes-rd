import {
  loadData,
  animesOf,
  avgNota,
  favoriteGenre,
  topGenres,
  exclusiveAnimes,
  formatNota,
  notaColor,
  favoriteAnime,
  mostControversial,
  prettyGenre,
} from "./data.js";
import { escapeHTML, shortText } from "./utils.js";

const PROFILE_TAGLINES = {
  Rafael: "Explorando historias, vivendo mundos.",
  Fernando: "Sempre em busca do proximo classico.",
  Dudu: "Colecionando hype, porrada e nostalgia.",
  Zana: "Analisando historias com carinho e caos.",
  Hacksuya: "Curadoria afiada para cada temporada.",
  default: "Catalogando historias que valem memoria.",
};

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const personNickname = urlParams.get("p") || hashParams.get("p");

  if (!personNickname) {
    window.location.href = "index.html";
    return;
  }

  try {
    const data = await loadData();
    const member = data.members.find((item) => item.nickname === personNickname);

    if (!member) {
      alert("Membro nao encontrado.");
      return;
    }

    const watched = animesOf(data.animes, personNickname);
    const average = avgNota(data.animes, personNickname);
    const best = favoriteAnime(data.animes, personNickname);
    const hottest = mostControversial(data.animes, personNickname);
    const favoriteGenreLabel = favoriteGenre(data.animes, personNickname);
    const exclusives = exclusiveAnimes(data.animes, personNickname);
    const genreBreakdown = topGenres(watched, 6);

    applyProfileTheme(member);
    renderHeader(member, {
      watched,
      average,
      favoriteGenreLabel,
    });
    renderHighlights(
      {
        best,
        bestScore: best ? best[`nota${personNickname}`] : null,
        hottest,
        favoriteGenreLabel,
      },
      member.color
    );
    renderStats({
      watched,
      average,
      exclusives,
    });
    renderTopAnimes(data.animes, personNickname, member.color);
    renderActivity(watched);
    renderGenres(genreBreakdown);
    renderExclusives(exclusives, personNickname);
  } catch (err) {
    console.error("Erro ao carregar perfil:", err);
  }
}

function applyProfileTheme(member) {
  const accent = member.color || "#8b5cf6";
  const accentSoft = withAlpha(accent, 0.38);

  document.body.style.setProperty("--profile-accent", accent);
  document.body.style.setProperty("--profile-accent-soft", accentSoft);
  document.body.style.setProperty("--profile-hero-image", "url('assets/nyx-hero-profile.png')");
}

function renderHeader(member, context) {
  const header = document.getElementById("profile-header");
  const accent = member.color || "#8b5cf6";
  const watchedCount = context.watched.length;
  const level = Math.max(1, Math.round(watchedCount / 6));
  const favoriteGenreText = escapeHTML(context.favoriteGenreLabel || "Sem genero dominante");

  header.innerHTML = `
    <div class="profile-hero-shell">
      <div class="profile-hero-copy">
        <div class="profile-hero-text">
          <div class="profile-name-row">
            <h1>${escapeHTML(member.nickname)}</h1>
          </div>
          <p class="profile-tagline">${escapeHTML(
            PROFILE_TAGLINES[member.nickname] || PROFILE_TAGLINES.default
          )}</p>
          <div class="profile-meta-grid">
            <article class="profile-meta-chip is-level">
              <span class="profile-meta-icon" aria-hidden="true">♛</span>
              <div class="profile-meta-content">
                <span class="profile-meta-label">Nivel</span>
                <strong>${level}</strong>
              </div>
            </article>
            <article class="profile-meta-chip is-watched">
              <span class="profile-meta-icon" aria-hidden="true">⌘</span>
              <div class="profile-meta-content">
                <span class="profile-meta-label">Titulos assistidos</span>
                <strong>${watchedCount}</strong>
              </div>
            </article>
            <article class="profile-meta-chip is-average">
              <span class="profile-meta-icon" aria-hidden="true">✦</span>
              <div class="profile-meta-content">
                <span class="profile-meta-label">Media pessoal</span>
                <strong>${formatNota(context.average)}</strong>
              </div>
            </article>
          </div>
        </div>
      </div>

      <div class="profile-hero-visual">
        <div class="profile-hero-visual-panel">
          <span class="profile-visual-kicker">Genero favorito</span>
          <strong>${favoriteGenreText}</strong>
          <p>${watchedCount} titulos assistidos com media ${formatNota(context.average)}.</p>
        </div>
      </div>
    </div>
  `;

  header.style.setProperty("--profile-local-accent", accent);
}

function renderHighlights(data, color) {
  const container = document.getElementById("profile-highlights");
  const bestImage = data.best?.image_url || "";
  const hottestImage = data.hottest?.image_url || data.best?.image_url || "";
  const bestScore = data.best ? formatNota(data.bestScore) : "-";
  const hottestGap = data.hottest ? Number(data.hottest.controversia || 0).toFixed(1) : "0.0";
  const favoriteLabel = escapeHTML(data.favoriteGenreLabel || "-");

  container.innerHTML = `
    <article class="profile-highlight-card is-best" style="--highlight-accent:${color}; --highlight-image:url('${bestImage}')">
      <span class="profile-highlight-label">Melhor avaliado</span>
      <strong class="profile-highlight-title">${escapeHTML(
        data.best ? shortText(data.best.name, 28) : "Sem registro"
      )}</strong>
      <span class="profile-highlight-subtitle">Nota</span>
      <span class="profile-highlight-value">${bestScore}</span>
      <span class="profile-highlight-orb" aria-hidden="true">★</span>
    </article>

    <article class="profile-highlight-card is-hot" style="--highlight-accent:#ff5f98; --highlight-image:url('${hottestImage}')">
      <span class="profile-highlight-label">Mais controverso</span>
      <strong class="profile-highlight-title">${escapeHTML(
        data.hottest ? shortText(data.hottest.name, 28) : "Sem registro"
      )}</strong>
      <span class="profile-highlight-subtitle">Diferenca</span>
      <span class="profile-highlight-value">${hottestGap}</span>
      <span class="profile-highlight-orb" aria-hidden="true">⌁</span>
    </article>

    <article class="profile-highlight-card is-genre" style="--highlight-accent:#8b5cf6">
      <span class="profile-highlight-label">Genero favorito</span>
      <strong class="profile-highlight-title">${favoriteLabel}</strong>
      <span class="profile-highlight-subtitle">Assinatura do perfil</span>
      <span class="profile-highlight-value">${favoriteLabel}</span>
      <span class="profile-highlight-orb" aria-hidden="true">✣</span>
    </article>
  `;
}

function renderStats(context) {
  const stats = document.getElementById("profile-stats");
  const scoreSeries = context.watched
    .map((anime) => Number(anime.notaSort || anime.nota || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, 16);

  const watchedSeries = [
    Math.max(1, context.watched.length - 28),
    Math.max(1, context.watched.length - 20),
    Math.max(1, context.watched.length - 18),
    Math.max(1, context.watched.length - 12),
    context.watched.length,
  ];

  stats.innerHTML = `
    <article class="profile-summary-card">
      <span class="profile-summary-label">Assistidos</span>
      <strong class="profile-summary-value">${context.watched.length}</strong>
      <span class="profile-summary-caption">animes</span>
      ${buildSparkline(watchedSeries, "purple")}
    </article>

    <article class="profile-summary-card is-accent">
      <span class="profile-summary-label">Media</span>
      <strong class="profile-summary-value">${formatNota(context.average)}</strong>
      <span class="profile-summary-caption">nota media</span>
      ${buildSparkline(scoreSeries, "pink")}
    </article>
  `;
}

function renderTopAnimes(animes, person, color) {
  const top10 = animesOf(animes, person)
    .filter((anime) => anime[`nota${person}`] !== null)
    .sort((a, b) => (b[`nota${person}`] || 0) - (a[`nota${person}`] || 0))
    .slice(0, 10);

  const container = document.getElementById("top-animes");
  if (!top10.length) {
    container.innerHTML = "<p class='profile-empty-state'>Nenhuma nota registrada.</p>";
    return;
  }

  container.innerHTML = top10
    .map(
      (anime, index) => `
        <article class="ranking-item">
          <div class="rank-number" style="color:${color}">${String(index + 1).padStart(2, "0")}</div>
          <img class="rank-thumb" src="${anime.image_url || "assets/nyx-icon.webp"}" alt="${escapeHTML(
            anime.name
          )}" />
          <div class="rank-info">
            <div class="rank-name">${escapeHTML(anime.name)}</div>
            <div class="rank-genres">${escapeHTML(
              (anime.genres || []).slice(0, 2).map((genre) => prettyGenre(genre)).join("  •  ")
            )}</div>
          </div>
          <div class="rank-score ${notaColor(anime[`nota${person}`])}">${formatNota(
            anime[`nota${person}`]
          )}</div>
        </article>
      `
    )
    .join("");
}

function renderActivity(watched) {
  const container = document.getElementById("profile-activity");
  if (!container) return;

  const sorted = watched
    .slice()
    .sort((a, b) => Number(b.notaSort || b.nota || 0) - Number(a.notaSort || a.nota || 0));

  const labels = ["Hoje", "Ontem", "2 dias atras", "3 dias atras", "4 dias atras"];
  const items = sorted.slice(0, 5).map((anime, index) => {
    const action =
      index === 1
        ? `Avaliou ${anime.name}`
        : index === 2
          ? `Adicionou 3 animes a lista`
          : index === 3
            ? `Assistiu ${anime.name}`
            : index === 4
              ? `Avaliou ${anime.name}`
              : `Assistiu ${anime.name}`;

    return {
      action,
      when: labels[index] || `${index + 1} dias atras`,
    };
  });

  if (!items.length) {
    container.innerHTML = "<p class='profile-empty-state'>Sem atividade recente.</p>";
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <article class="profile-activity-item">
          <span class="profile-activity-dot" aria-hidden="true"></span>
          <span class="profile-activity-text">${escapeHTML(item.action)}</span>
          <span class="profile-activity-time">${escapeHTML(item.when)}</span>
        </article>
      `
    )
    .join("");
}

function renderGenres(genres) {
  const container = document.getElementById("genre-chart");

  if (!genres.length) {
    container.innerHTML = "<p class='profile-empty-state'>Sem dados de genero.</p>";
    return;
  }

  const maxCount = genres[0][1] || 1;
  container.innerHTML = genres
    .map(
      ([name, count]) => `
        <div class="genre-bar-row">
          <div class="genre-bar-info">
            <span>${escapeHTML(name)}</span>
            <small>${count} animes</small>
          </div>
          <div class="genre-bar-bg">
            <div class="genre-bar-fill" style="width:${(count / maxCount) * 100}%"></div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderExclusives(exclusives, person) {
  const container = document.getElementById("exclusive-list");

  if (!exclusives.length) {
    container.innerHTML =
      "<p class='profile-empty-state'>Nenhum anime exclusivo para este perfil.</p>";
    return;
  }

  container.innerHTML = exclusives
    .slice(0, 12)
    .map(
      (anime) => `
        <article class="exclusive-mini-card">
          <img src="${anime.image_url || "assets/nyx-icon.webp"}" alt="${escapeHTML(
            anime.name
          )}" />
          <div class="exclusive-info">
            <strong>${escapeHTML(anime.name)}</strong>
            <span>Nota ${formatNota(anime[`nota${person}`])}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function buildSparkline(values, tone) {
  const clean = (values || []).filter((value) => Number.isFinite(value));
  if (!clean.length) return "";

  const width = 280;
  const height = 70;
  const max = Math.max(...clean);
  const min = Math.min(...clean);
  const range = Math.max(max - min, 1);
  const step = clean.length === 1 ? width : width / (clean.length - 1);

  const points = clean.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / range) * (height - 10) - 5;
    return [x, y];
  });

  const path = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  return `
    <svg class="profile-sparkline profile-sparkline-${tone}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <path class="profile-sparkline-area" d="${path} L ${width} ${height} L 0 ${height} Z"></path>
      <path class="profile-sparkline-line" d="${path}"></path>
    </svg>
  `;
}

function withAlpha(hex, alpha) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return "rgba(139, 92, 246, 0.38)";
  const channels = value.match(/.{1,2}/g).map((part) => parseInt(part, 16));
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}

window.addEventListener("hashchange", () => window.location.reload());

init();
