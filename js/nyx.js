import {
  PEOPLE,
  animesOf,
  favoriteGenre,
  formatNota,
  loadData,
  missedAnimes,
} from "./data.js?v=ciel-1";
import { escapeHTML, stripEmoji } from "./utils.js";

// ── Recommendation engine ────────────────────────────────────────────────────

function scoreAnime(anime, genre) {
  const genreBonus = (anime.generos || []).some(
    (g) => stripEmoji(g).toLowerCase() === stripEmoji(genre || "").toLowerCase(),
  )
    ? 0.35
    : 0;
  const voteBonus = Math.min(Number(anime.qtdVotos || 0), 4) * 0.08;
  return Number(anime.nota || 0) + genreBonus + voteBonus;
}

function pickRecommendations(animes, person, genreFilter) {
  const favorite = favoriteGenre(animes, person);
  const genre = genreFilter || favorite;
  return missedAnimes(animes, person)
    .filter((anime) => {
      if (Number(anime.nota) < 8) return false;
      if (genreFilter) {
        return (anime.generos || []).some(
          (g) => stripEmoji(g).toLowerCase().includes(genreFilter.toLowerCase()),
        );
      }
      return true;
    })
    .sort((a, b) => scoreAnime(b, genre) - scoreAnime(a, genre))
    .slice(0, 6)
    .map((anime) => {
      const watchers = (anime.quemAssistiu || []).filter((n) => n !== person);
      const genreMatch = (anime.generos || []).some(
        (g) => stripEmoji(g).toLowerCase() === stripEmoji(favorite).toLowerCase(),
      );
      const reason = genreMatch
        ? `combina com seu gosto por ${stripEmoji(favorite)}`
        : watchers.length
          ? `${watchers.join(", ")} já assistiu e a nota está forte`
          : "nota geral alta no acervo";
      return { ...anime, reason };
    });
}

// ── Intent parser ────────────────────────────────────────────────────────────

const GENRE_KEYWORDS = [
  "ação", "acao", "fantasia", "drama", "comedia", "comédia", "romance",
  "shounen", "isekai", "terror", "mecha", "slice of life", "ecchi",
  "esportes", "sci-fi", "sobrenatural", "psicológico", "psicologico",
];

function parseIntent(text, person) {
  const lower = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const foundPerson = PEOPLE.find((p) => lower.includes(p.toLowerCase()));
  const foundGenre = GENRE_KEYWORDS.find((g) =>
    lower.includes(g.normalize("NFD").replace(/[̀-ͯ]/g, "")),
  );

  if (/^(oi|ola|ei|bom|boa|alo|hey|hello|salve)/.test(lower))
    return { type: "greet" };

  if (/quant|total|acervo|quanto|estatistica|base de dados/.test(lower))
    return { type: "stats" };

  if (/top|melhor|mais visto|nota alta|ranking|melhores/.test(lower))
    return { type: "top" };

  if (foundGenre)
    return { type: "recommend", genre: foundGenre, person: foundPerson || person };

  if (/recomend|indica|sugere|assistir|ver|proximo|proxim/.test(lower))
    return { type: "recommend", person: foundPerson || person };

  if (foundPerson)
    return { type: "recommend", person: foundPerson };

  return { type: "unknown" };
}

// ── Ciel responses ───────────────────────────────────────────────────────────

const GREETINGS = [
  "Análise de saudação concluída. Sou Ciel. Posso recomendar animes do acervo, gerar estatísticas ou ranquear títulos. Como posso auxiliar?",
  "Sistema online. Detecto uma saudação. Estou pronta para processar suas consultas sobre o acervo do grupo.",
  "Inicialização completa. Memória do acervo carregada. O que deseja analisar?",
];

const UNKNOWNS = [
  "Entrada não reconhecida. Posso recomendar animes, exibir o top do acervo ou gerar estatísticas do grupo.",
  "Processamento incompleto. Tente perguntar sobre recomendações, rankings ou o acervo.",
  "Protocolo não identificado. Minhas capacidades incluem recomendações, análise de perfis e estatísticas do acervo.",
];

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildStatsResponse(data, person) {
  const total = data.animes.length;
  const watched = animesOf(data.animes, person).length;
  const remaining = total - watched;
  const fav = favoriteGenre(data.animes, person);
  return `Análise concluída para ${person}. Acervo total: ${total} animes. Assistidos: ${watched}. Pendentes: ${remaining}. Gênero dominante no perfil: ${stripEmoji(fav)}.`;
}

function buildTopResponse(data) {
  const top = [...data.animes]
    .filter((a) => a.nota !== null && a.qtdVotos > 1)
    .sort((a, b) => Number(b.nota) - Number(a.nota))
    .slice(0, 5);
  if (!top.length) return "Dados insuficientes para ranking. Nenhum anime com múltiplos votos encontrado.";
  const list = top.map((a, i) => `${i + 1}. ${a.nome} (${formatNota(a.nota)})`).join("\n");
  return `Protocolo de ranking executado. Top 5 do acervo:\n\n${list}`;
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

function scrollToBottom() {
  const log = document.getElementById("ciel-messages");
  if (log) log.scrollTop = log.scrollHeight;
}

function addMessage(role, html) {
  const log = document.getElementById("ciel-messages");
  if (!log) return;
  const wrap = document.createElement("div");
  wrap.className = role === "ciel" ? "ciel-msg ciel-msg-ciel" : "ciel-msg ciel-msg-user";
  if (role === "ciel") {
    wrap.innerHTML = `
      <div class="ciel-msg-avatar">◈</div>
      <div class="ciel-msg-bubble">${html}</div>
    `;
  } else {
    wrap.innerHTML = `<div class="ciel-msg-bubble">${html}</div>`;
  }
  log.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function addTypingIndicator() {
  return addMessage(
    "ciel",
    `<span class="ciel-typing"><span></span><span></span><span></span></span>`,
  );
}

function addRecCards(picks) {
  const log = document.getElementById("ciel-messages");
  if (!log) return;
  const wrap = document.createElement("div");
  wrap.className = "ciel-msg ciel-msg-ciel ciel-msg-cards";
  const cards = picks
    .map(
      (anime, i) => `
    <a class="ciel-rec-card" href="acervo.html?anime=${encodeURIComponent(anime.id)}">
      <span class="ciel-rec-rank">${String(i + 1).padStart(2, "0")}</span>
      <div class="ciel-rec-body">
        <strong>${escapeHTML(anime.nome)}</strong>
        <p>${escapeHTML(anime.reason)}.</p>
        <small>Nota ${formatNota(anime.nota)} · ${anime.qtdVotos || 0} voto(s)</small>
      </div>
    </a>`,
    )
    .join("");
  wrap.innerHTML = `
    <div class="ciel-msg-avatar">◈</div>
    <div class="ciel-rec-list">${cards}</div>
  `;
  log.appendChild(wrap);
  scrollToBottom();
}

// ── Main chat handler ────────────────────────────────────────────────────────

async function handleMessage(text, data, person) {
  if (!text.trim()) return;

  addMessage("user", escapeHTML(text));

  const typing = addTypingIndicator();

  await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));
  typing?.remove();

  const intent = parseIntent(text, person);

  if (intent.type === "greet") {
    addMessage("ciel", rand(GREETINGS).replace(/\n/g, "<br>"));
    return;
  }
  if (intent.type === "stats") {
    addMessage("ciel", buildStatsResponse(data, person).replace(/\n/g, "<br>"));
    return;
  }
  if (intent.type === "top") {
    addMessage("ciel", buildTopResponse(data).replace(/\n/g, "<br>"));
    return;
  }
  if (intent.type === "recommend") {
    const picks = pickRecommendations(data.animes, intent.person, intent.genre);
    if (!picks.length) {
      addMessage(
        "ciel",
        `Análise concluída para ${intent.person}. Todos os animes qualificados já foram assistidos.`,
      );
      return;
    }
    const prefix = intent.genre
      ? `Protocolo de busca por gênero <strong>${intent.genre}</strong> executado. Recomendações para ${intent.person}:`
      : `Análise de perfil concluída para <strong>${intent.person}</strong>. Recomendações geradas:`;
    addMessage("ciel", prefix);
    addRecCards(picks.slice(0, 4));
    return;
  }
  addMessage("ciel", rand(UNKNOWNS));
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const data = await loadData();
  let selectedPerson = PEOPLE[0];

  // Sidebar counts
  document.getElementById("ciel-count").textContent = `${data.animes.length} títulos`;

  function updatePersonCount() {
    const n = animesOf(data.animes, selectedPerson).length;
    document.getElementById("ciel-person-count").textContent =
      `${selectedPerson}: ${n} assistidos`;
  }

  // Member selector
  function renderPeople() {
    const el = document.getElementById("ciel-people");
    el.innerHTML = PEOPLE.map(
      (p) => `<button type="button" class="${p === selectedPerson ? "active" : ""}" data-person="${p}">${p}</button>`,
    ).join("");
  }

  renderPeople();
  updatePersonCount();

  document.getElementById("ciel-people").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-person]");
    if (!btn) return;
    selectedPerson = btn.dataset.person;
    renderPeople();
    updatePersonCount();
  });

  // Initial greeting
  await new Promise((r) => setTimeout(r, 400));
  const typing = addTypingIndicator();
  await new Promise((r) => setTimeout(r, 1200));
  typing?.remove();
  addMessage(
    "ciel",
    "Inicialização concluída. Sou <strong>Ciel</strong>. Tenho acesso ao acervo completo do grupo e posso recomendar animes, exibir rankings e analisar perfis. Como posso auxiliar?",
  );

  // Quick action buttons
  document.querySelector(".ciel-quick-actions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-quick]");
    if (!btn) return;
    const actions = {
      recommend: `Recomenda um anime para ${selectedPerson}`,
      top: "Qual o top 5 do acervo?",
      genre: `Recomenda algo do gênero favorito de ${selectedPerson}`,
      stats: `Estatísticas de ${selectedPerson}`,
    };
    handleMessage(actions[btn.dataset.quick], data, selectedPerson);
  });

  // Input
  const input = document.getElementById("ciel-input");
  document.getElementById("ciel-send").addEventListener("click", () => {
    handleMessage(input.value, data, selectedPerson);
    input.value = "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleMessage(input.value, data, selectedPerson);
      input.value = "";
    }
  });
}

init().catch((err) => {
  console.error(err);
  addMessage("ciel", "Erro ao carregar o acervo. Tente recarregar a página.");
});
