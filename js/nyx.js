import {
  PEOPLE,
  animesOf,
  favoriteGenre,
  formatNota,
  loadData,
  missedAnimes,
} from "./data.js?v=nav-fix-1";
import { escapeHTML, stripEmoji } from "./utils.js";

function scoreAnime(anime, favorite) {
  const genreBonus = (anime.generos || []).some(
    (genre) => stripEmoji(genre) === stripEmoji(favorite),
  )
    ? 0.35
    : 0;
  const voteBonus = Math.min(Number(anime.qtdVotos || 0), 4) * 0.08;
  return Number(anime.nota || 0) + genreBonus + voteBonus;
}

function recommendationReason(anime, person, favorite) {
  const watchers = (anime.quemAssistiu || []).filter((name) => name !== person);
  const genreMatch = (anime.generos || []).some(
    (genre) => stripEmoji(genre) === stripEmoji(favorite),
  );
  if (genreMatch) return `combina com seu gosto por ${stripEmoji(favorite)}`;
  if (watchers.length) return `${watchers.join(", ")} ja viu e a nota geral esta forte`;
  return "tem uma nota geral alta no acervo";
}

function pickRecommendations(animes, person) {
  const favorite = favoriteGenre(animes, person);
  return missedAnimes(animes, person)
    .filter((anime) => Number(anime.nota) >= 8)
    .sort((a, b) => scoreAnime(b, favorite) - scoreAnime(a, favorite))
    .slice(0, 6)
    .map((anime) => ({
      ...anime,
      reason: recommendationReason(anime, person, favorite),
    }));
}

function pickSingleRecommendation(animes, person) {
  const list = pickRecommendations(animes, person);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function chatPhrase(animeName) {
  const phrases = [
    `Eu recomendo esse aqui: ${animeName}`,
    `Você vai gostar desse: ${animeName}`,
    `Acho que esse combina contigo: ${animeName}`,
    `Minha dica de agora é: ${animeName}`,
    `Vai nesse sem medo: ${animeName}`,
  ];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

function renderPeople(current) {
  const tabs = document.getElementById("nyx-people");
  tabs.innerHTML = PEOPLE.map(
    (person) => `
    <button type="button" class="${person === current ? "active" : ""}" data-person="${person}">
      ${person}
    </button>
  `,
  ).join("");
}

function renderRecommendations(data, person) {
  const watched = animesOf(data.animes, person).length;
  const recommendations = pickRecommendations(data.animes, person);
  const output = document.getElementById("nyx-results");

  document.getElementById("nyx-summary").textContent =
    `${person} ja assistiu ${watched} animes. A Nyx separou dicas que ainda nao estao na lista dessa pessoa.`;

  output.innerHTML =
    recommendations
      .map(
        (anime, index) => `
    <a class="nyx-rec-card" href="acervo.html?anime=${encodeURIComponent(anime.id)}">
      <span class="nyx-rank">${String(index + 1).padStart(2, "0")}</span>
      <div>
        <h3>${escapeHTML(anime.nome)}</h3>
        <p>${escapeHTML(anime.reason)}.</p>
        <small>Nota geral ${formatNota(anime.nota)} · ${anime.qtdVotos || 0} voto(s)</small>
      </div>
    </a>
  `,
      )
      .join("") || `<p class="nyx-empty">A Nyx nao encontrou recomendacoes novas agora.</p>`;
}

function pushChatMessage(text) {
  const log = document.getElementById("nyx-chat-log");
  if (!log) return;
  const row = document.createElement("div");
  row.className = "nyx-chat-row";

  const avatar = document.createElement("img");
  avatar.className = "nyx-chat-avatar";
  avatar.src = "assets/nyx-hero.webp?v=nav-fix-1";
  avatar.alt = "Nyx";
  avatar.width = 38;
  avatar.height = 38;
  avatar.decoding = "async";

  const bubble = document.createElement("div");
  bubble.className = "nyx-chat-bubble";
  bubble.textContent = text;

  row.append(avatar, bubble);
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

async function init() {
  const data = await loadData();
  let selectedPerson = PEOPLE[0];

  renderPeople(selectedPerson);
  renderRecommendations(data, selectedPerson);

  document.getElementById("nyx-people").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-person]");
    if (!button) return;
    selectedPerson = button.dataset.person;
    renderPeople(selectedPerson);
    renderRecommendations(data, selectedPerson);
  });

  document.getElementById("nyx-recommend-btn")?.addEventListener("click", () => {
    const anime = pickSingleRecommendation(data.animes, selectedPerson);
    pushChatMessage(anime ? chatPhrase(anime.nome) : "Não encontrei uma recomendação nova agora.");
  });
}

init().catch((error) => {
  console.error(error);
  document.getElementById("nyx-summary").textContent =
    "A Nyx nao conseguiu carregar o acervo agora.";
});
