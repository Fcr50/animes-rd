// js/desafios.js
import {
  animesOf,
  avgNota,
  favoriteGenre,
  formatNota,
  getPersonNota,
  loadData,
  missedAnimes,
} from "./data.js";
import { supabase } from "./supabase-client.js";
import { escapeHTML, getGroupId, shortText, stripEmoji } from "./utils.js";

let state = {
  data: { animes: [], members: [], total: 0 },
  activities: [],
  boardIndex: 0,
  boardTimer: null,
  comments: [],
  pollCandidates: [],
  debateIndex: 0,
};

const $ = (selector) => document.querySelector(selector);
const BOARD_ROTATION_MS = 5000;

function storageKey(name) {
  return `community-v2:${getGroupId() || "global"}:${name}`;
}

function readStore(name, fallback) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(name))) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStore(name, value) {
  try {
    localStorage.setItem(storageKey(name), JSON.stringify(value));
  } catch {}
}

function getApprovedAnimes() {
  const { animes } = state.data;
  const approved = animes.filter((anime) => anime.status === "approved");
  return approved.length ? approved : animes;
}

function getComments(animes, members) {
  return animes.flatMap((anime) => {
    if (!anime.comentarios) return [];
    return anime.comentarios
      .split("\n")
      .map((line) => {
        const [person, ...rest] = line.split(": ");
        const text = rest.join(": ").trim();
        const member = members.find((m) => m.nickname === person?.trim());
        return {
          anime,
          color: member?.color || "#a78bfa",
          person: person?.trim() || "Comunidade",
          text,
        };
      })
      .filter((comment) => comment.text.length > 3);
  });
}

function scoreNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function activityTime(value) {
  if (!value) return "agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseActivityDate(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object" && "_seconds" in value) {
    return new Date(value._seconds * 1000);
  }
  return null;
}

function animeActivityDate(anime) {
  return (
    parseActivityDate(anime.updated_at) ||
    parseActivityDate(anime.updatedAt) ||
    parseActivityDate(anime.created_at) ||
    new Date(0)
  );
}

function getAnimeByMalId(data, malId) {
  return data.animes.find((anime) => String(anime.mal_id || anime.id) === String(malId));
}

function getMemberByUserId(data, userId) {
  return data.members.find((member) => member.user_id === userId);
}

async function loadRecentActivity(data) {
  const groupId = getGroupId();
  if (!groupId) return [];

  try {
    const [votesResult, animesResult] = await Promise.all([
      supabase
        .from("votes")
        .select("mal_id, user_id, score, comment, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(18),
      supabase
        .from("group_animes")
        .select("mal_id, added_by, status, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    if (votesResult.error) throw votesResult.error;
    if (animesResult.error) throw animesResult.error;

    const voteActivities = (votesResult.data || []).flatMap((vote) => {
      const anime = getAnimeByMalId(data, vote.mal_id);
      const member = getMemberByUserId(data, vote.user_id);
      if (!anime || !member) return [];

      const scoreLabel = vote.score !== null ? formatNota(vote.score) : "não assistiu";
      const base = {
        accent: member.color || "#a78bfa",
        animeName: anime.name,
        at: vote.created_at,
        person: member.nickname,
      };

      const items = [
        {
          ...base,
          title: `${member.nickname} deu nota`,
          body:
            vote.score !== null
              ? `${formatNota(vote.score)} para ${anime.name}`
              : `marcou ${anime.name} como não assistido`,
          meta: activityTime(vote.created_at),
        },
      ];

      if (vote.comment) {
        items.unshift({
          ...base,
          title: `${member.nickname} comentou`,
          body: `"${shortText(vote.comment, 120)}"`,
          meta: `${anime.name} · ${scoreLabel} · ${activityTime(vote.created_at)}`,
        });
      }

      return items;
    });

    const animeActivities = (animesResult.data || []).flatMap((item) => {
      const anime = getAnimeByMalId(data, item.mal_id);
      const member = getMemberByUserId(data, item.added_by);
      if (!anime) return [];
      return {
        accent: member?.color || "#61e6b8",
        animeName: anime.name,
        at: item.created_at,
        person: member?.nickname || "Comunidade",
        title: item.status === "approved" ? "Anime entrou no acervo" : "Anime foi sugerido",
        body: anime.name,
        meta: `${member?.nickname ? `por ${member.nickname} · ` : ""}${activityTime(item.created_at)}`,
      };
    });

    return [...voteActivities, ...animeActivities]
      .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
      .slice(0, 12);
  } catch (error) {
    console.warn("[Comunidade] Falha ao carregar atividades recentes", error);
    return [];
  }
}

function buildDerivedActivity(data, comments) {
  const commentActivities = comments.slice(0, 10).map((comment) => {
    const at = animeActivityDate(comment.anime);
    return {
      accent: comment.color,
      animeName: comment.anime.name,
      at: at.toISOString(),
      person: comment.person,
      title: `${comment.person} comentou`,
      body: `"${shortText(comment.text, 120)}"`,
      meta: `${comment.anime.name} · ${activityTime(at)}`,
    };
  });

  const scoreActivities = data.animes
    .flatMap((anime) =>
      data.members
        .map((member) => {
          const score = getPersonNota(anime, member.nickname);
          if (score === null || score === undefined) return null;
          const at = animeActivityDate(anime);
          return {
            accent: member.color || "#a78bfa",
            animeName: anime.name,
            at: at.toISOString(),
            person: member.nickname,
            title: `${member.nickname} deu nota`,
            body: `${formatNota(score)} para ${anime.name}`,
            meta: activityTime(at),
          };
        })
        .filter(Boolean),
    )
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .slice(0, 12);

  return [...commentActivities, ...scoreActivities]
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .slice(0, 12);
}

function renderEmptyState() {
  const shell = $(".community-v2-shell");
  if (!shell) return;
  shell.innerHTML = `
    <section class="community-empty">
      <span class="eyebrow">Comunidade</span>
      <h1>Escolha um grupo para abrir a comunidade.</h1>
      <p>Esta página usa o acervo, votos e membros do grupo ativo para montar enquetes, ranking, afinidades e agenda.</p>
      <a href="index.html">Voltar ao dashboard</a>
    </section>
  `;
}

function renderMetrics() {
  const { members, animes } = state.data;
  const totalVotes = animes.reduce((sum, anime) => sum + (Number(anime.qtdVotos) || 0), 0);
  $("#community-total-members").textContent = members.length;
  $("#community-total-animes").textContent = state.data.total || animes.length;
  $("#community-total-votes").textContent = totalVotes;
  $("#community-total-comments").textContent = state.comments.length;
}

function boardNote(kind, label, anime, meta) {
  if (!anime) return "";
  return `
    <a class="community-board-note ${kind}" href="acervo.html#g=${getGroupId()}&open=${anime.mal_id}">
      <span>${escapeHTML(label)}</span>
      <strong>${escapeHTML(anime.name)}</strong>
      <small>${escapeHTML(meta)}</small>
    </a>
  `;
}

function getBoardSlides() {
  const animes = getApprovedAnimes();
  const hot = [...animes].sort(
    (a, b) => scoreNumber(b.controversia) - scoreNumber(a.controversia),
  )[0];
  const top = [...animes].sort((a, b) => scoreNumber(b.nota) - scoreNumber(a.nota))[0];
  const watched = [...animes].sort((a, b) => (b.qtdVotos || 0) - (a.qtdVotos || 0))[0];
  const hidden = [...animes]
    .filter((anime) => (anime.qtdVotos || 0) > 0 && (anime.qtdVotos || 0) <= 2)
    .sort((a, b) => scoreNumber(b.nota) - scoreNumber(a.nota))[0];
  const fresh = [...animes].sort((a, b) => animeActivityDate(b) - animeActivityDate(a))[0];
  const freshMeta = fresh ? `mexido em ${activityTime(animeActivityDate(fresh))}` : "";
  const underdog = [...animes]
    .filter((anime) => scoreNumber(anime.nota) >= 7 && scoreNumber(anime.nota) < 8.5)
    .sort((a, b) => scoreNumber(b.controversia) - scoreNumber(a.controversia))[0];
  const recentCommentAnime = state.activities.find((activity) =>
    activity.title?.includes("comentou"),
  );
  const commented = recentCommentAnime
    ? getAnimeByMalId(state.data, recentCommentAnime.animeName) ||
      animes.find((anime) => anime.name === recentCommentAnime.animeName)
    : null;

  return [
    {
      kicker: "Quadro do clube",
      title: "Hoje tem assunto.",
      body: "Três pistas rápidas para puxar conversa, marcar sessão ou decidir o próximo play.",
      notes: [
        boardNote(
          "is-next",
          "Play sugerido",
          top,
          `${formatNota(top?.nota)} de média · ${top?.qtdVotos || 0} votos`,
        ),
        boardNote(
          "is-hot",
          "Treta saudável",
          hot,
          `${formatNota(hot?.controversia || 0)} de controvérsia`,
        ),
        boardNote(
          "is-known",
          "Porta de entrada",
          watched,
          `${watched?.qtdVotos || 0} membros votaram`,
        ),
      ],
    },
    {
      kicker: "Rodada de descoberta",
      title: "Tira um da sombra.",
      body: "O clube também precisa olhar para os animes que ainda não tiveram chance suficiente.",
      notes: [
        boardNote(
          "is-next",
          "Achado escondido",
          hidden,
          `${formatNota(hidden?.nota)} de média · poucos votos`,
        ),
        boardNote("is-hot", "Atualizado recente", fresh, freshMeta),
        boardNote("is-known", "Aposta segura", top, `${formatNota(top?.nota)} de média no grupo`),
      ],
    },
    {
      kicker: "Pauta social",
      title: "Quem vai defender?",
      body: "Ideias rápidas para transformar nota e comentário em conversa de grupo.",
      notes: [
        boardNote(
          "is-hot",
          "Debate quente",
          underdog || hot,
          `${formatNota((underdog || hot)?.controversia || 0)} de controvérsia`,
        ),
        boardNote(
          "is-known",
          "Comentado agora",
          commented || watched,
          recentCommentAnime?.person
            ? `puxado por ${recentCommentAnime.person}`
            : "bom para resposta rápida",
        ),
        boardNote(
          "is-next",
          "Sessão candidata",
          watched,
          `${watched?.qtdVotos || 0} votos registrados`,
        ),
      ],
    },
  ].filter((slide) => slide.notes.some(Boolean));
}

function renderSpotlight() {
  const host = $("#community-spotlight");
  if (!host) return;

  const slides = getBoardSlides();
  if (!slides.length) {
    host.innerHTML = `<div class="community-spotlight-empty">A comunidade aparece quando o acervo tiver animes votados.</div>`;
    return;
  }

  const index = state.boardIndex % slides.length;
  const slide = slides[index];

  host.style.removeProperty("--spotlight-image");
  host.innerHTML = `
    <div class="community-club-board">
      <span class="community-board-kicker">${escapeHTML(slide.kicker)}</span>
      <h2>${escapeHTML(slide.title)}</h2>
      <p>${escapeHTML(slide.body)}</p>
      <div class="community-board-stack">
        ${slide.notes.join("")}
      </div>
      <div class="community-board-dots" aria-label="Rotação do quadro">
        ${slides
          .map(
            (_, dotIndex) =>
              `<span class="${dotIndex === index ? "active" : ""}" data-board-slide="${dotIndex}" role="button" tabindex="0" aria-label="Mostrar pauta ${dotIndex + 1}"></span>`,
          )
          .join("")}
      </div>
    </div>
  `;

  host.querySelector(".community-board-dots")?.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-board-slide]");
    if (!dot) return;
    setBoardSlide(Number(dot.dataset.boardSlide), true);
  });

  host.querySelector(".community-board-dots")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const dot = event.target.closest("[data-board-slide]");
    if (!dot) return;
    event.preventDefault();
    setBoardSlide(Number(dot.dataset.boardSlide), true);
  });
}

function setBoardSlide(index, shouldRestart = false) {
  const slides = getBoardSlides();
  if (!slides.length) return;
  state.boardIndex = ((index % slides.length) + slides.length) % slides.length;
  renderSpotlight();
  if (shouldRestart) startBoardRotation();
}

function startBoardRotation() {
  if (state.boardTimer) clearInterval(state.boardTimer);
  const slides = getBoardSlides();
  if (slides.length <= 1) return;
  state.boardTimer = setInterval(() => {
    setBoardSlide(state.boardIndex + 1);
  }, BOARD_ROTATION_MS);
}

function renderFeed() {
  const feed = $("#community-feed");
  if (!feed) return;

  const activities = state.activities.map((item) => ({
    accent: item.accent,
    title: item.title,
    body: item.body,
    meta: item.meta,
  }));

  const comments = state.comments.slice(0, 6).map((comment) => ({
    accent: comment.color,
    title: `${comment.person} comentou`,
    body: `"${shortText(comment.text, 105)}"`,
    meta: comment.anime.name,
  }));

  const hot = [...getApprovedAnimes()]
    .sort((a, b) => scoreNumber(b.controversia) - scoreNumber(a.controversia))
    .slice(0, 4)
    .map((anime) => ({
      accent: "#fb923c",
      title: "Debate aquecido",
      body: `${anime.name} está dividindo opiniões.`,
      meta: `${formatNota(anime.controversia || 0)} de controvérsia`,
    }));

  const items = [...activities, ...comments, ...hot].slice(0, 12);
  feed.innerHTML = items.length
    ? items
        .map(
          (item) => `
        <article class="community-feed-item" style="--item-color:${item.accent}">
          <span>${escapeHTML(item.title)}</span>
          <strong>${escapeHTML(item.body)}</strong>
          <small>${escapeHTML(item.meta)}</small>
        </article>
      `,
        )
        .join("")
    : `<div class="community-soft-empty">Sem atividade ainda. O mural começa a respirar quando o grupo vota, comenta e sugere animes.</div>`;
}

function choosePollCandidates() {
  const animes = getApprovedAnimes();
  const controversial = [...animes]
    .sort((a, b) => scoreNumber(b.controversia) - scoreNumber(a.controversia))
    .slice(0, 2);
  const favorites = [...animes]
    .sort((a, b) => scoreNumber(b.nota) - scoreNumber(a.nota))
    .slice(0, 2);
  const watched = [...animes].sort((a, b) => (b.qtdVotos || 0) - (a.qtdVotos || 0)).slice(0, 2);
  const unique = new Map(
    [...controversial, ...favorites, ...watched].map((anime) => [anime.mal_id || anime.id, anime]),
  );
  return [...unique.values()].slice(0, 4);
}

function renderPoll() {
  const memberSelect = $("#community-poll-member");
  const options = $("#community-poll-options");
  if (!memberSelect || !options) return;

  const { members } = state.data;
  state.pollCandidates = choosePollCandidates();
  const poll = readStore("poll", {});

  memberSelect.innerHTML = members
    .map((member) => `<option value="${member.nickname}">${escapeHTML(member.nickname)}</option>`)
    .join("");

  const totals = state.pollCandidates.map((anime) => {
    const voters = Object.entries(poll)
      .filter(([, animeId]) => String(animeId) === String(anime.mal_id || anime.id))
      .map(([name]) => name);
    return { anime, voters };
  });
  const max = Math.max(1, ...totals.map((item) => item.voters.length));

  options.innerHTML = totals.length
    ? totals
        .map(({ anime, voters }) => {
          const id = anime.mal_id || anime.id;
          return `
            <button class="community-poll-option" type="button" data-poll-anime="${id}">
              <span>${escapeHTML(shortText(anime.name, 42))}</span>
              <strong>${voters.length} voto${voters.length === 1 ? "" : "s"}</strong>
              <i style="width:${(voters.length / max) * 100}%"></i>
              <small>${voters.length ? escapeHTML(voters.join(", ")) : "Seja o primeiro voto"}</small>
            </button>
          `;
        })
        .join("")
    : `<div class="community-soft-empty">Sem opções suficientes no acervo para abrir enquete.</div>`;
}

function bindPoll() {
  $("#community-poll-options")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-poll-anime]");
    const member = $("#community-poll-member")?.value;
    if (!button || !member) return;
    const poll = readStore("poll", {});
    poll[member] = button.dataset.pollAnime;
    writeStore("poll", poll);
    renderPoll();
  });

  $("#community-reset-poll")?.addEventListener("click", () => {
    writeStore("poll", {});
    renderPoll();
  });
}

function renderEvents() {
  const { members } = state.data;
  const animes = getApprovedAnimes();
  const animeSelect = $("#community-event-anime");
  const hostSelect = $("#community-event-host");
  const list = $("#community-events-list");
  if (!animeSelect || !hostSelect || !list) return;

  animeSelect.innerHTML = animes
    .slice(0, 80)
    .map(
      (anime) => `<option value="${anime.mal_id || anime.id}">${escapeHTML(anime.name)}</option>`,
    )
    .join("");
  hostSelect.innerHTML = members
    .map((member) => `<option value="${member.nickname}">${escapeHTML(member.nickname)}</option>`)
    .join("");

  const events = readStore("events", []);
  list.innerHTML = events.length
    ? events
        .map(
          (item, index) => `
          <article class="community-event-card">
            <div>
              <span>${escapeHTML(item.host)} chamou sessão</span>
              <strong>${escapeHTML(item.animeName)}</strong>
              <small>${escapeHTML(item.when || "Data a combinar")}</small>
              ${item.link ? `<a href="${escapeHTML(item.link)}" target="_blank" rel="noopener noreferrer">Abrir link</a>` : ""}
            </div>
            <button type="button" data-remove-event="${index}">Remover</button>
          </article>
        `,
        )
        .join("")
    : `<div class="community-soft-empty">Nenhuma sessão marcada localmente ainda.</div>`;
}

function bindEvents() {
  $("#community-event-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const animes = getApprovedAnimes();
    const animeId = $("#community-event-anime")?.value;
    const anime = animes.find((item) => String(item.mal_id || item.id) === String(animeId));
    const host = $("#community-event-host")?.value;
    if (!anime || !host) return;

    const events = readStore("events", []);
    events.unshift({
      animeId,
      animeName: anime.name,
      host,
      link: $("#community-event-link")?.value.trim() || "",
      when: $("#community-event-date")?.value
        ? new Date($("#community-event-date").value).toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          })
        : "",
    });
    writeStore("events", events.slice(0, 8));
    event.target.reset();
    renderEvents();
  });

  $("#community-events-list")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-event]");
    if (!button) return;
    const events = readStore("events", []);
    events.splice(Number(button.dataset.removeEvent), 1);
    writeStore("events", events);
    renderEvents();
  });
}

function renderLeaderboard() {
  const host = $("#community-leaderboard");
  const { animes, members } = state.data;
  if (!host) return;

  const rows = members
    .map((member) => {
      const watched = animesOf(animes, member.nickname);
      const commentCount = state.comments.filter(
        (comment) => comment.person === member.nickname,
      ).length;
      const openings = Array.isArray(member.openings) ? member.openings.length : 0;
      const points = watched.length * 2 + commentCount * 4 + openings * 3;
      return { member, watched, commentCount, openings, points };
    })
    .sort((a, b) => b.points - a.points);

  host.innerHTML = rows
    .map(
      (row, index) => `
      <article class="community-leader-row" style="--member-color:${row.member.color || "#a78bfa"}">
        <span>${index + 1}</span>
        <div>
          <strong>${escapeHTML(row.member.nickname)}</strong>
          <small>${row.watched.length} vistos, ${row.commentCount} comentários, ${row.openings} openings</small>
        </div>
        <em>${row.points}</em>
      </article>
    `,
    )
    .join("");
}

function renderAffinity() {
  const host = $("#community-affinity-grid");
  const { members, animes } = state.data;
  if (!host) return;

  const pairs = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i];
      const b = members[j];
      const common = animes.filter(
        (anime) =>
          getPersonNota(anime, a.nickname) !== null && getPersonNota(anime, b.nickname) !== null,
      );
      const diffAvg = common.length
        ? common.reduce(
            (sum, anime) =>
              sum +
              Math.abs(
                Number(getPersonNota(anime, a.nickname)) - Number(getPersonNota(anime, b.nickname)),
              ),
            0,
          ) / common.length
        : 10;
      pairs.push({
        a,
        b,
        common: common.length,
        score: Math.max(0, Math.round(100 - diffAvg * 13)),
      });
    }
  }

  host.innerHTML = pairs.length
    ? pairs
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map(
          (pair) => `
        <article class="community-affinity-card">
          <div><span style="background:${pair.a.color || "#a78bfa"}"></span>${escapeHTML(pair.a.nickname)}</div>
          <div><span style="background:${pair.b.color || "#67e8f9"}"></span>${escapeHTML(pair.b.nickname)}</div>
          <strong>${pair.score}%</strong>
          <small>${pair.common} animes em comum</small>
        </article>
      `,
        )
        .join("")
    : `<div class="community-soft-empty">Ainda faltam votos em comum para calcular afinidades.</div>`;
}

function getMissions() {
  const animes = getApprovedAnimes();
  const hot = [...animes].sort(
    (a, b) => scoreNumber(b.controversia) - scoreNumber(a.controversia),
  )[0];
  const hidden = [...animes]
    .filter((anime) => (anime.qtdVotos || 0) <= 2)
    .sort((a, b) => scoreNumber(b.nota) - scoreNumber(a.nota))[0];
  return [
    {
      id: "comment",
      title: "Puxar assunto",
      body: "Comentar em um anime que ainda está sem defesa apaixonada.",
    },
    {
      id: "watch",
      title: "Marcar sessão",
      body: "Criar uma sessão local para o grupo assistir junto.",
    },
    {
      id: "hot",
      title: "Resolver a treta",
      body: hot
        ? `Revisitar ${hot.name}, o anime mais controverso do momento.`
        : "Encontrar o anime mais controverso do grupo.",
    },
    {
      id: "hidden",
      title: "Caça ao achado",
      body: hidden
        ? `Dar chance para ${hidden.name}, que ainda tem poucos votos.`
        : "Escolher um título pouco votado para tirar da sombra.",
    },
  ];
}

function renderMissions() {
  const host = $("#community-missions-list");
  if (!host) return;
  const done = readStore("missions", {});
  host.innerHTML = getMissions()
    .map(
      (mission) => `
      <label class="community-mission ${done[mission.id] ? "done" : ""}">
        <input type="checkbox" data-mission="${mission.id}" ${done[mission.id] ? "checked" : ""} />
        <span>
          <strong>${escapeHTML(mission.title)}</strong>
          <small>${escapeHTML(mission.body)}</small>
        </span>
      </label>
    `,
    )
    .join("");
}

function bindMissions() {
  $("#community-missions-list")?.addEventListener("change", (event) => {
    const input = event.target.closest("[data-mission]");
    if (!input) return;
    const done = readStore("missions", {});
    done[input.dataset.mission] = input.checked;
    writeStore("missions", done);
    renderMissions();
  });
}

function debatePrompts() {
  const animes = getApprovedAnimes();
  const { members } = state.data;
  const top = [...animes].sort((a, b) => scoreNumber(b.nota) - scoreNumber(a.nota))[0];
  const hot = [...animes].sort(
    (a, b) => scoreNumber(b.controversia) - scoreNumber(a.controversia),
  )[0];
  const watched = [...animes].sort((a, b) => (b.qtdVotos || 0) - (a.qtdVotos || 0))[0];

  const scoredPairs = animes
    .flatMap((anime) => {
      const scores = members
        .map((member) => ({
          member,
          score: getPersonNota(anime, member.nickname),
        }))
        .filter((item) => item.score !== null);
      if (scores.length < 2) return [];
      const high = [...scores].sort((a, b) => Number(b.score) - Number(a.score))[0];
      const low = [...scores].sort((a, b) => Number(a.score) - Number(b.score))[0];
      return {
        anime,
        diff: Number(high.score) - Number(low.score),
        high,
        low,
      };
    })
    .filter((item) => item.diff >= 1)
    .sort((a, b) => b.diff - a.diff);

  const clash = scoredPairs[0];
  const recentComment = state.activities.find((item) => item.title?.includes("comentou"));
  const quietAnime = [...animes]
    .filter((anime) => (anime.qtdVotos || 0) > 0 && (anime.qtdVotos || 0) <= 2)
    .sort((a, b) => scoreNumber(b.nota) - scoreNumber(a.nota))[0];
  const missingTarget = members
    .map((member) => ({
      member,
      missed: missedAnimes(animes, member.nickname).filter((anime) => scoreNumber(anime.nota) >= 8),
    }))
    .filter((item) => item.missed.length)
    .sort((a, b) => b.missed.length - a.missed.length)[0];

  return [
    clash
      ? {
          prompt: `${clash.high.member.nickname} deu ${formatNota(clash.high.score)} e ${clash.low.member.nickname} deu ${formatNota(clash.low.score)} para ${clash.anime.name}. Quem convence quem?`,
          action: "Regra da rodada: cada lado tem 3 argumentos e um anime para usar como prova.",
        }
      : null,
    hot
      ? {
          prompt: `${hot.name} divide o grupo. O problema é hype alto, ritmo estranho ou gosto pessoal mesmo?`,
          action: "Votem no culpado: hype, ritmo, final, personagem ou birra assumida.",
        }
      : null,
    recentComment
      ? {
          prompt: `${recentComment.person} puxou assunto sobre ${recentComment.animeName}. Alguém concorda ou vai defender o contrário?`,
          action: "Responder com uma nota, uma frase e uma recomendação parecida.",
        }
      : null,
    missingTarget
      ? {
          prompt: `${missingTarget.member.nickname} ainda tem ${missingTarget.missed.length} anime(s) 8+ pendente(s). Qual é o obrigatório primeiro?`,
          action: `Comecem por ${missingTarget.missed[0].name} ou indiquem uma alternativa melhor.`,
        }
      : null,
    quietAnime
      ? {
          prompt: `${quietAnime.name} tem pouca gente votando. Achado escondido ou só passou despercebido?`,
          action:
            "Missão relâmpago: mais duas pessoas assistirem ou alguém explicar por que não vale.",
        }
      : null,
    watched
      ? {
          prompt: `Se alguém novo entrasse hoje, ${watched.name} venderia bem o gosto do grupo?`,
          action: "Escolham uma porta de entrada melhor se discordarem.",
        }
      : null,
    top
      ? {
          prompt: `${top.name} está no topo. Qual anime do acervo tem chance real de derrubar esse reinado?`,
          action: "Cada pessoa indica um desafiante e defende em uma frase.",
        }
      : null,
    {
      prompt: "Tribunal do grupo: qual anime está com nota injusta e quem vai defender a revisão?",
      action: "Formato rápido: acusação, defesa e veredito final: sobe, desce ou mantém.",
    },
    {
      prompt: "Qual anime você defenderia sozinho contra o grupo inteiro?",
      action: "Vale escolher só um. A defesa precisa ter argumento, não só apego emocional.",
    },
    {
      prompt:
        "Se o grupo tivesse que marcar sessão hoje, qual anime geraria mais comentário no chat?",
      action: "Indiquem uma opção segura e uma opção caótica.",
    },
  ].filter(Boolean);
}

function renderDebate() {
  const host = $("#community-debate-card");
  if (!host) return;
  const prompts = debatePrompts();
  const item = prompts[state.debateIndex % prompts.length];
  host.innerHTML = `
    <p>${escapeHTML(item.prompt)}</p>
    <span>${escapeHTML(item.action)}</span>
  `;
}

function bindDebate() {
  $("#community-next-debate")?.addEventListener("click", () => {
    state.debateIndex += 1;
    renderDebate();
  });
}

function renderMemberRadar() {
  const select = $("#community-member-select");
  const host = $("#community-member-radar");
  const { members, animes } = state.data;
  if (!select || !host) return;

  if (!select.value) {
    select.innerHTML = members
      .map((member) => `<option value="${member.nickname}">${escapeHTML(member.nickname)}</option>`)
      .join("");
  }

  const member = members.find((item) => item.nickname === select.value) || members[0];
  if (!member) {
    host.innerHTML = `<div class="community-soft-empty">Sem membros para exibir.</div>`;
    return;
  }

  const watched = animesOf(animes, member.nickname);
  const missed = missedAnimes(animes, member.nickname).slice(0, 4);
  const top = [...watched]
    .sort(
      (a, b) =>
        scoreNumber(getPersonNota(b, member.nickname)) -
        scoreNumber(getPersonNota(a, member.nickname)),
    )
    .slice(0, 3);

  host.innerHTML = `
    <div class="community-radar-card" style="--member-color:${member.color || "#a78bfa"}">
      <div>
        <span>Perfil</span>
        <h3>${escapeHTML(member.nickname)}</h3>
        <p>${watched.length} assistidos, média ${avgNota(animes, member.nickname) ? Number(avgNota(animes, member.nickname)).toFixed(1) : "sem média"} e gênero favorito ${escapeHTML(stripEmoji(favoriteGenre(animes, member.nickname)))}.</p>
      </div>
      <a href="profile.html#p=${encodeURIComponent(member.nickname)}&g=${getGroupId()}">Abrir perfil</a>
    </div>
    <div class="community-radar-lists">
      <section>
        <strong>Top pessoal</strong>
        ${top.length ? top.map((anime) => `<span>${escapeHTML(anime.name)} <em>${formatNota(getPersonNota(anime, member.nickname))}</em></span>`).join("") : "<small>Sem votos ainda.</small>"}
      </section>
      <section>
        <strong>Recomendar para assistir</strong>
        ${missed.length ? missed.map((anime) => `<span>${escapeHTML(anime.name)} <em>${formatNota(anime.nota)}</em></span>`).join("") : "<small>Sem recomendações pendentes.</small>"}
      </section>
    </div>
  `;
}

function bindMemberRadar() {
  $("#community-member-select")?.addEventListener("change", renderMemberRadar);
}

function renderVibes() {
  const host = $("#community-vibe-buttons");
  const result = $("#community-vibe-result");
  if (!host || !result) return;

  const vibes = [
    {
      id: "intenso",
      label: "Intenso",
      genres: ["Action", "Ação", "Suspense", "Psychological", "Psicológico"],
    },
    { id: "leve", label: "Leve", genres: ["Comedy", "Comédia", "Slice of Life", "Romance"] },
    {
      id: "fantasia",
      label: "Fantasia",
      genres: ["Fantasy", "Fantasia", "Adventure", "Aventura", "Isekai"],
    },
    { id: "classico", label: "Consagrado", genres: [] },
  ];

  host.innerHTML = vibes
    .map((vibe) => `<button type="button" data-vibe="${vibe.id}">${vibe.label}</button>`)
    .join("");

  const showVibe = (id) => {
    const vibe = vibes.find((item) => item.id === id) || vibes[0];
    const pool = getApprovedAnimes()
      .filter(
        (anime) =>
          !vibe.genres.length ||
          (anime.genres || []).some((genre) => vibe.genres.includes(stripEmoji(genre))),
      )
      .sort((a, b) => scoreNumber(b.nota) - scoreNumber(a.nota));
    const pick = pool[0] || getApprovedAnimes()[0];
    result.innerHTML = pick
      ? `<strong>${escapeHTML(pick.name)}</strong><span>${formatNota(pick.nota)} de média. ${pick.qtdVotos || 0} votos no grupo.</span>`
      : `<span>Sem anime suficiente para recomendar por vibe.</span>`;
  };

  host.onclick = (event) => {
    const button = event.target.closest("[data-vibe]");
    if (!button) return;
    host
      .querySelectorAll("button")
      .forEach((item) => item.classList.toggle("active", item === button));
    showVibe(button.dataset.vibe);
  };

  host.querySelector("button")?.classList.add("active");
  showVibe(vibes[0].id);
}

function bindScrollActions() {
  $("#community-refresh-feed")?.addEventListener("click", renderFeed);
}

function setCommunityTab(tabName, shouldScroll = false) {
  const fallback = "mural";
  const target = document.querySelector(`[data-community-panel="${tabName}"]`) ? tabName : fallback;

  document.querySelectorAll("[data-community-tab]").forEach((button) => {
    const active = button.dataset.communityTab === target;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  document.querySelectorAll("[data-community-panel]").forEach((panel) => {
    const active = panel.dataset.communityPanel === target;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });

  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  hashParams.set("tab", target);
  const newHash = hashParams.toString();
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${newHash}`);

  if (shouldScroll) {
    document
      .querySelector(".community-tabs")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function bindCommunityTabs() {
  document.querySelectorAll("[data-community-tab]").forEach((button) => {
    button.addEventListener("click", () => setCommunityTab(button.dataset.communityTab));
  });

  document.querySelectorAll("[data-community-tab-jump]").forEach((button) => {
    button.addEventListener("click", () => setCommunityTab(button.dataset.communityTabJump, true));
  });

  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  setCommunityTab(hashParams.get("tab") || "mural");
}

function renderAll() {
  renderMetrics();
  renderSpotlight();
  renderFeed();
  renderPoll();
  renderEvents();
  renderLeaderboard();
  renderAffinity();
  renderMissions();
  renderDebate();
  renderMemberRadar();
  renderVibes();
}

async function init() {
  const data = await loadData();
  if (!getGroupId()) {
    renderEmptyState();
    return;
  }

  state.data = data;
  state.comments = getComments(data.animes, data.members);
  state.activities = await loadRecentActivity(data);
  if (!state.activities.length) {
    state.activities = buildDerivedActivity(data, state.comments);
  }
  bindScrollActions();
  bindPoll();
  bindEvents();
  bindMissions();
  bindDebate();
  bindMemberRadar();
  bindCommunityTabs();
  renderAll();
  startBoardRotation();
}

init().catch((error) => {
  console.error("[Comunidade]", error);
  renderEmptyState();
});
