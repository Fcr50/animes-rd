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
import { escapeHTML, getGroupId, shortText, stripEmoji } from "./utils.js";

let state = {
  data: { animes: [], members: [], total: 0 },
  comments: [],
  pollCandidates: [],
  debateIndex: 0,
};

const $ = (selector) => document.querySelector(selector);

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

function renderSpotlight() {
  const host = $("#community-spotlight");
  const animes = getApprovedAnimes();
  if (!host) return;

  const top = [...animes].sort(
    (a, b) =>
      scoreNumber(b.nota) +
      scoreNumber(b.controversia) -
      (scoreNumber(a.nota) + scoreNumber(a.controversia)),
  )[0];

  if (!top) {
    host.innerHTML = `<div class="community-spotlight-empty">A comunidade aparece quando o acervo tiver animes votados.</div>`;
    return;
  }

  const hot = [...animes].sort(
    (a, b) => scoreNumber(b.controversia) - scoreNumber(a.controversia),
  )[0];
  const watched = [...animes].sort((a, b) => (b.qtdVotos || 0) - (a.qtdVotos || 0))[0];

  host.style.removeProperty("--spotlight-image");
  host.innerHTML = `
    <div class="community-club-board">
      <span class="community-board-kicker">Quadro do clube</span>
      <h2>Hoje tem assunto.</h2>
      <p>Três pistas rápidas para puxar conversa, marcar sessão ou decidir o próximo play.</p>
      <div class="community-board-stack">
        <a class="community-board-note is-next" href="acervo.html#g=${getGroupId()}&open=${top.mal_id}">
          <span>Play sugerido</span>
          <strong>${escapeHTML(top.name)}</strong>
          <small>${formatNota(top.nota)} de média · ${top.qtdVotos || 0} votos</small>
        </a>
        <a class="community-board-note is-hot" href="acervo.html#g=${getGroupId()}&open=${hot?.mal_id || top.mal_id}">
          <span>Treta saudável</span>
          <strong>${escapeHTML(hot?.name || top.name)}</strong>
          <small>${formatNota(hot?.controversia || 0)} de controvérsia</small>
        </a>
        <a class="community-board-note is-known" href="acervo.html#g=${getGroupId()}&open=${watched?.mal_id || top.mal_id}">
          <span>Porta de entrada</span>
          <strong>${escapeHTML(watched?.name || top.name)}</strong>
          <small>${watched?.qtdVotos || top.qtdVotos || 0} membros votaram</small>
        </a>
      </div>
    </div>
  `;
}

function renderFeed() {
  const feed = $("#community-feed");
  if (!feed) return;

  const comments = state.comments.slice(0, 8).map((comment) => ({
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

  const items = [...comments, ...hot].slice(0, 10);
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
    : `<div class="community-soft-empty">Sem comentários ainda. O mural começa a respirar quando o grupo vota e comenta no acervo.</div>`;
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
  const top = [...animes].sort((a, b) => scoreNumber(b.nota) - scoreNumber(a.nota))[0];
  const hot = [...animes].sort(
    (a, b) => scoreNumber(b.controversia) - scoreNumber(a.controversia),
  )[0];
  const watched = [...animes].sort((a, b) => (b.qtdVotos || 0) - (a.qtdVotos || 0))[0];
  return [
    top
      ? `${top.name} é realmente tudo isso ou a nota do grupo está generosa?`
      : "Qual anime merece defender o topo do grupo?",
    hot
      ? `O que explica a divisão em ${hot.name}? Gosto, ritmo, final ou expectativa?`
      : "Qual anime mais divide opiniões aqui?",
    watched
      ? `${watched.name} seria uma boa porta de entrada para alguém novo no grupo?`
      : "Qual anime representa melhor o gosto do grupo?",
    "Qual gênero o grupo está subestimando no acervo?",
    "Que anime todo mundo deveria rever com calma antes de bater o martelo?",
  ];
}

function renderDebate() {
  const host = $("#community-debate-card");
  if (!host) return;
  const prompts = debatePrompts();
  const prompt = prompts[state.debateIndex % prompts.length];
  host.innerHTML = `
    <p>${escapeHTML(prompt)}</p>
    <span>Use isso como pauta para comentário, chamada ou próxima sessão.</span>
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
  bindScrollActions();
  bindPoll();
  bindEvents();
  bindMissions();
  bindDebate();
  bindMemberRadar();
  bindCommunityTabs();
  renderAll();
}

init().catch((error) => {
  console.error("[Comunidade]", error);
  renderEmptyState();
});
