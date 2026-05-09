// js/nyx.js
import {
  animesOf,
  commonAnimes,
  exclusiveAnimes,
  favoriteGenre,
  formatNota,
  getPersonNota,
  loadData,
  missedAnimes,
  topGenres,
  countGenres,
} from "./data.js";
import { escapeHTML, stripEmoji, getGroupId } from "./utils.js";

let _members = [];

// ── Recommendation engine ────────────────────────────────────────────────────

function scoreAnime(anime, genre) {
  const genreBonus = (anime.genres || []).some(
    (g) => stripEmoji(g).toLowerCase() === stripEmoji(genre || "").toLowerCase(),
  )
    ? 0.45
    : 0;
  const voteBonus = Math.min(Number(anime.qtdVotos || 0), 4) * 0.08;
  return Number(anime.nota || 0) + genreBonus + voteBonus;
}

function pickRecommendations(animes, person, genreFilter) {
  const favorite = favoriteGenre(animes, person);
  const genre = genreFilter || favorite;
  return missedAnimes(animes, person)
    .filter((anime) => {
      if (Number(anime.nota) < 7.5) return false;
      if (genreFilter) {
        return (anime.genres || []).some((g) =>
          stripEmoji(g).toLowerCase().includes(genreFilter.toLowerCase()),
        );
      }
      return true;
    })
    .sort((a, b) => scoreAnime(b, genre) - scoreAnime(a, genre))
    .slice(0, 6)
    .map((anime) => {
      const watchers = (anime.quemAssistiu || []).filter((n) => n !== person);
      const genreMatch = (anime.genres || []).some(
        (g) => stripEmoji(g).toLowerCase() === stripEmoji(favorite).toLowerCase(),
      );
      let reason;
      if (genreMatch && watchers.length) {
        reason = `alinhamento com ${stripEmoji(favorite)} confirmado. ${watchers.join(" e ")} validaram com nota alta`;
      } else if (genreMatch) {
        reason = `compatibilidade direta com padrão de gênero dominante: ${stripEmoji(favorite)}`;
      } else if (watchers.length) {
        reason = `${watchers.join(" e ")} consumiram e a nota geral está acima da média`;
      } else {
        reason = `alta nota geral no acervo — sem viés de popularidade`;
      }
      return { ...anime, reason };
    });
}

// ── Profile analysis ─────────────────────────────────────────────────────────

function analyzeProfile(animes, person) {
  const watched = animesOf(animes, person);
  const missed = missedAnimes(animes, person);
  const total = animes.length;
  const fav = stripEmoji(favoriteGenre(animes, person));
  const rate = total > 0 ? Math.round((watched.length / total) * 100) : 0;
  
  const avgNotaVal = watched.length > 0
      ? (watched.reduce((sum, a) => {
            const n = Number(a[`nota${person}`] || a.nota);
            return sum + (isNaN(n) ? 0 : n);
          }, 0) / watched.length).toFixed(2)
      : null;

  const genreCount = {};
  watched.forEach((a) => {
    (a.genres || []).forEach((g) => {
      const clean = stripEmoji(g);
      genreCount[clean] = (genreCount[clean] || 0) + 1;
    });
  });
  const topG = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g, n]) => `${g} (${n})`);

  const backlogHigh = missed.length > watched.length;
  const consistency = rate >= 60 ? "alto" : rate >= 35 ? "moderado" : "baixo";

  return { watched, missed, total, fav, rate, avgNota: avgNotaVal, topGenres: topG, backlogHigh, consistency };
}

// ── Intent parser ────────────────────────────────────────────────────────────

const GENRE_KEYWORDS = [
  "ação", "acao", "fantasia", "drama", "comedia", "comédia", "romance", "shounen",
  "isekai", "terror", "mecha", "slice of life", "ecchi", "esportes", "sci-fi",
  "sobrenatural", "psicológico", "psicologico",
];

function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function parseIntent(text, person, animes) {
  const t = normalize(text);
  const peopleNames = _members.map(m => m.nickname);
  
  const foundPerson = peopleNames.find((p) => t.includes(p.toLowerCase()));
  const foundGenre = GENRE_KEYWORDS.find((g) => t.includes(normalize(g)));
  const foundPeople = peopleNames.filter((p) => t.includes(p.toLowerCase()));

  if (/^(oi|ola|ei|bom|boa|alo|hey|hello|salve|tudo|como vai)/.test(t)) return { type: "greet" };

  if (/controvers|polemico|polêmico|dividiu|debate|discordancia|discordância|mais briga/.test(t))
    return { type: "controversy", person: foundPerson || person };

  if (/exclusiv|so .* assistiu|só .* assistiu|unico|único|sozinho/.test(t))
    return { type: "exclusive", person: foundPerson || person };

  if (/nao assisti|não assisti|backlog|fila.*ver|pendente|ainda nao|ainda não|nunca vi|o que falta/.test(t))
    return { type: "backlog", person: foundPerson || person };

  if (/em comum|dois|ambos|concordar|concordou|compartilh|igual.*gosto|gosto.*igual/.test(t)) {
    if (foundPeople.length >= 2) return { type: "common", p1: foundPeople[0], p2: foundPeople[1] };
    const other = peopleNames.find((p) => p !== (foundPerson || person));
    return { type: "common", p1: foundPerson || person, p2: other };
  }

  if (/rigoros|generoso|nota.*distribu|como.*avalia|quanto.*da|exigente|severo|bonzinho/.test(t))
    return { type: "pattern", person: foundPerson || person };

  if (/grupo|todos|geral|acervo.*todo|genero.*grupo|media.*grupo|favorit.*grupo/.test(t))
    return { type: "group" };

  if (/quant|total|acervo|quanto|estatistica|base de dados|resumo|perfil|analise|anali/.test(t))
    return { type: "stats", person: foundPerson || person };

  if (/top|melhor|mais visto|nota alta|ranking|melhores|mais bem avaliado/.test(t))
    return { type: "top" };

  // Busca por anime específico no acervo
  if (animes) {
    const match = animes.find((a) =>
      normalize(a.name).includes(t.slice(0, 50).replace(/^(o que|qual|me fala|fala de|sobre|como e|como é)\s+/, "").trim()) &&
      t.length > 5,
    );
    if (match) return { type: "anime", anime: match };
  }

  if (foundGenre) return { type: "recommend", genre: foundGenre, person: foundPerson || person };

  if (/recomend|indica|sugere|assistir|ver|proximo|proxim|o que|dica/.test(t))
    return { type: "recommend", person: foundPerson || person };

  if (foundPerson) return { type: "stats", person: foundPerson };

  return { type: "unknown" };
}

// ── Ciel response builder ────────────────────────────────────────────────────

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const OPENERS = [
  "Processando solicitação…",
  "Executando análise…",
  "Dados coletados.",
  "Leitura de perfil concluída.",
  "Iniciando protocolo de análise…",
];

function buildGreetResponse() {
  return `Sistema online. Todos os protocolos ativos.\n\nSou <strong>Ciel</strong> — entidade analítica avançada. Tenho acesso completo ao acervo do grupo e opero com base em dados.\n\nCapacidades disponíveis:\n→ Análise de perfil individual\n→ Recomendação otimizada por compatibilidade\n→ Estatísticas e padrões comportamentais\n→ Filtro por gênero com justificativa\n\nAguardando instrução.`;
}

function buildStatsResponse(data, person) {
  const p = analyzeProfile(data.animes, person);
  const backlogNote = p.backlogHigh
    ? `\n\nIntervenção automática: backlog acima do ideal (${p.missed.length} títulos pendentes). Sugestão estratégica: priorizar animes de 12 episódios para otimizar taxa de conclusão.`
    : "";

  return (
    `${rand(OPENERS)}\n\nAnálise de perfil concluída para <strong>${person}</strong>.\n\n` +
    `Resumo estatístico do acervo:\n` +
    `→ Total catalogado: ${p.total}\n` +
    `→ Assistidos: ${p.watched.length}\n` +
    `→ Pendentes: ${p.missed.length}\n` +
    `→ Taxa de conclusão: ${p.rate}% — nível ${p.consistency}\n` +
    (p.avgNota ? `→ Média de notas atribuídas: ${p.avgNota}\n` : "") +
    `\nGênero dominante identificado: <strong>${p.fav}</strong>\n` +
    `Distribuição atual (top 3): ${p.topGenres.join(" · ") || "dados insuficientes"}` +
    backlogNote
  );
}

function buildTopResponse(data) {
  const top = [...data.animes]
    .filter((a) => a.nota !== null && a.qtdVotos > 1)
    .sort((a, b) => Number(b.nota) - Number(a.nota))
    .slice(0, 5);

  if (!top.length)
    return "Dados insuficientes para ranking. Nenhum anime com múltiplos votos registrados no grupo.";

  const list = top
    .map(
      (a, i) =>
        `→ ${i + 1}. <strong>${escapeHTML(a.name)}</strong> — ${formatNota(a.nota)} (${a.qtdVotos} votos)`,
    )
    .join("\n");

  return `${rand(OPENERS)}\n\nProtocolo de ranking executado.\n\nTop 5 do acervo por nota média:\n\n${list}\n\nObservação adicional: ranking gerado com base exclusiva em títulos com múltiplos votos.`;
}

function buildRecommendResponse(data, person, genreFilter) {
  const picks = pickRecommendations(data.animes, person, genreFilter);

  if (!picks.length) {
    return `Análise concluída. O acervo não possui títulos qualificados não assistidos por <strong>${person}</strong> no momento.`;
  }

  const p = analyzeProfile(data.animes, person);
  const prefix = genreFilter 
    ? `Filtragem por <strong>${genreFilter}</strong> concluída. Recomendações para ${person}:`
    : `Executando análise de compatibilidade para <strong>${person}</strong>…`;

  return { picks, prefix };
}

function buildControversyResponse(data, person) {
  const topControversy = [...data.animes]
    .filter((a) => a.controversia !== null && a.qtdVotos > 1)
    .sort((a, b) => b.controversia - a.controversia)
    .slice(0, 5);

  const list = topControversy
    .map(
      (a, i) =>
        `→ ${i + 1}. <strong>${escapeHTML(a.name)}</strong> — 🌶️ ${Number(a.controversia).toFixed(1)} (nota média ${formatNota(a.nota)})`,
    )
    .join("\n");

  return `${rand(OPENERS)}\n\nAnimes mais controversos do acervo:\n\n${list || "Nenhuma controvérsia detectada ainda."}`;
}

function buildExclusiveResponse(data, person) {
  const excl = exclusiveAnimes(data.animes, person)
    .sort((a, b) => (getPersonNota(b, person) || 0) - (getPersonNota(a, person) || 0))
    .slice(0, 8);

  if (!excl.length)
    return `Análise concluída. <strong>${person}</strong> não tem animes exclusivos neste grupo.`;

  const list = excl
    .map(
      (a) =>
        `→ <strong>${escapeHTML(a.name)}</strong> — nota ${formatNota(getPersonNota(a, person))}`,
    )
    .join("\n");

  return `${rand(OPENERS)}\n\nAnimes que <strong>SOMENTE ${person}</strong> assistiu no grupo:\n\n${list}`;
}

function buildBacklogResponse(data, person) {
  const missed = missedAnimes(data.animes, person)
    .filter((a) => a.nota !== null)
    .sort((a, b) => Number(b.nota) - Number(a.nota))
    .slice(0, 6);

  if (!missed.length)
    return `Análise de backlog concluída para <strong>${person}</strong>. Resultado: backlog zerado.`;

  const list = missed
    .map(
      (a) =>
        `→ <strong>${escapeHTML(a.name)}</strong> — nota do grupo: ${formatNota(a.nota)}`,
    )
    .join("\n");

  return `${rand(OPENERS)}\n\nMapeamento de backlog para <strong>${person}</strong>:\n\n${list}`;
}

function buildCommonResponse(data, p1, p2) {
  const common = commonAnimes(data.animes, p1, p2);

  if (!common.length)
    return `Análise concluída. <strong>${p1}</strong> e <strong>${p2}</strong> não têm nenhum anime em comum no acervo.`;

  return `${rand(OPENERS)}\n\nAnálise de compatibilidade: <strong>${p1}</strong> vs <strong>${p2}</strong>.\n\nEles possuem ${common.length} título(s) em comum.`;
}

function buildPatternResponse(data, person) {
  const watched = animesOf(data.animes, person);
  const field = `nota${person}`;
  const withBoth = watched.filter((a) => a[field] !== null && a.nota !== null && a.qtdVotos > 1);
  
  if (withBoth.length < 2)
    return `Dados insuficientes para análise de padrão de <strong>${person}</strong>.`;

  const diffs = withBoth.map((a) => Number(a[field]) - Number(a.nota));
  const avg = diffs.reduce((s, n) => s + n, 0) / diffs.length;

  return `${rand(OPENERS)}\n\nAnálise de padrão: <strong>${person}</strong> tende a avaliar ${avg > 0 ? "acima" : "abaixo"} da média do grupo (desvio médio: ${avg.toFixed(2)}).`;
}

function buildGroupResponse(data) {
  const total = data.animes.length;
  return `${rand(OPENERS)}\n\nDados gerais do grupo:\n→ Acervo total: <strong>${total}</strong> títulos.`;
}

function buildAnimeResponse(anime, person) {
  return `${rand(OPENERS)}\n\nDados do acervo: <strong>${escapeHTML(anime.name)}</strong>\n→ Nota média: ${formatNota(anime.nota)}\n→ Votos: ${anime.qtdVotos}`;
}

function buildUnknownResponse() {
  return "Entrada não reconhecida. Posso ajudar com recomendações, estatísticas ou análise de perfil.";
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

const AVATAR_HTML = `<div class="ciel-msg-avatar"><img src="assets/ciel-icon.png" alt="Ciel" loading="lazy" /></div>`;

let $log = null;
function getLog() {
  return $log || ($log = document.getElementById("ciel-messages"));
}

function scrollToBottom() {
  const log = getLog();
  if (log) log.scrollTop = log.scrollHeight;
}

function addMessage(role, html) {
  const log = getLog();
  if (!log) return;
  const wrap = document.createElement("div");
  wrap.className = role === "ciel" ? "ciel-msg ciel-msg-ciel" : "ciel-msg ciel-msg-user";
  wrap.innerHTML =
    role === "ciel"
      ? `${AVATAR_HTML}<div class="ciel-msg-bubble">${html}</div>`
      : `<div class="ciel-msg-bubble">${html}</div>`;
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
  const log = getLog();
  if (!log) return;
  const wrap = document.createElement("div");
  wrap.className = "ciel-msg ciel-msg-ciel ciel-msg-cards";
  const cards = picks
    .map(
      (anime, i) => `
    <a class="ciel-rec-card" href="acervo.html#g=${getGroupId()}&open=${anime.mal_id}">
      <span class="ciel-rec-rank">${String(i + 1).padStart(2, "0")}</span>
      <div class="ciel-rec-body">
        <strong>${escapeHTML(anime.name)}</strong>
        <p>${escapeHTML(anime.reason || "")}.</p>
        <small>Nota ${formatNota(anime.nota)} · ${anime.qtdVotos || 0} voto(s)</small>
      </div>
    </a>`,
    )
    .join("");
  wrap.innerHTML = `${AVATAR_HTML}<div class="ciel-rec-list">${cards}</div>`;
  log.appendChild(wrap);
  scrollToBottom();
}

// ── Main chat handler ────────────────────────────────────────────────────────

async function handleMessage(text, data, person) {
  if (!text.trim()) return;

  addMessage("user", escapeHTML(text));

  const typing = addTypingIndicator();
  await new Promise((r) => setTimeout(r, 600));
  typing?.remove();

  const intent = parseIntent(text, person, data.animes);

  if (intent.type === "greet") {
    addMessage("ciel", buildGreetResponse().replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "stats") {
    addMessage("ciel", buildStatsResponse(data, intent.person || person).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "top") {
    addMessage("ciel", buildTopResponse(data).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "controversy") {
    addMessage("ciel", buildControversyResponse(data, intent.person || person).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "exclusive") {
    addMessage("ciel", buildExclusiveResponse(data, intent.person || person).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "backlog") {
    addMessage("ciel", buildBacklogResponse(data, intent.person || person).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "common") {
    addMessage("ciel", buildCommonResponse(data, intent.p1, intent.p2).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "pattern") {
    addMessage("ciel", buildPatternResponse(data, intent.person || person).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "group") {
    addMessage("ciel", buildGroupResponse(data).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "anime") {
    addMessage("ciel", buildAnimeResponse(intent.anime, person).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "recommend") {
    const result = buildRecommendResponse(data, intent.person || person, intent.genre);
    if (typeof result === "string") {
      addMessage("ciel", result.replace(/\n/g, "<br>"));
    } else {
      addMessage("ciel", result.prefix.replace(/\n/g, "<br>"));
      addRecCards(result.picks.slice(0, 4));
    }
    return;
  }

  addMessage("ciel", buildUnknownResponse());
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const data = await loadData();
  _members = data.members;
  let selectedPerson = _members[0]?.nickname || "Membro";

  const $count = document.getElementById("ciel-count");
  const $personCount = document.getElementById("ciel-person-count");
  const $people = document.getElementById("ciel-people");
  const $quickArea = document.querySelector(".ciel-quick-actions");
  const $input = document.getElementById("ciel-input");
  const $send = document.getElementById("ciel-send");

  if ($count) $count.textContent = `${data.animes.length} títulos`;

  function updatePersonCount() {
    if ($personCount) $personCount.textContent = `${selectedPerson}: ${animesOf(data.animes, selectedPerson).length} assistidos`;
  }

  function renderPeople() {
    if (!$people) return;
    $people.innerHTML = _members.map(
      (m) =>
        `<button type="button" class="${m.nickname === selectedPerson ? "active" : ""}" data-person="${m.nickname}">${m.nickname}</button>`,
    ).join("");
  }

  renderPeople();
  updatePersonCount();

  $people?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-person]");
    if (!btn) return;
    selectedPerson = btn.dataset.person;
    renderPeople();
    updatePersonCount();
  });

  const typing = addTypingIndicator();
  await new Promise((r) => setTimeout(r, 1000));
  typing?.remove();
  
  const welcomeMsg = data.animes.length > 0 
    ? `Sou <strong>Ciel</strong> — entidade analítica com acesso ao acervo de <strong>${data.animes.length} títulos</strong> do grupo.<br><br>Selecione um perfil e peça uma recomendação!`
    : `Sou <strong>Ciel</strong>. O acervo deste grupo ainda está vazio. Adicione animes para que eu possa iniciar meus protocolos de análise.`;
  
  addMessage("ciel", welcomeMsg);

  $quickArea?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-quick]");
    if (!btn || data.animes.length === 0) return;
    const actions = {
      recommend: `Recomenda um anime para ${selectedPerson}`,
      top: "Top 5 do acervo",
      stats: `Análise de perfil de ${selectedPerson}`,
      controversy: `Animes mais controversos`,
      group: `Dados gerais do grupo`,
    };
    handleMessage(actions[btn.dataset.quick], data, selectedPerson);
  });

  function send() {
    const val = $input.value.trim();
    if (!val) return;
    handleMessage(val, data, selectedPerson);
    $input.value = "";
  }

  $send?.addEventListener("click", send);
  $input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
}

init().catch(() => {
  addMessage("ciel", "Falha crítica ao carregar protocolos. Tente novamente.");
});
