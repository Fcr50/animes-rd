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
} from "./data.js?v=platform-v18";
import { escapeHTML, stripEmoji } from "./utils.js";

let members = [];

// ── Recommendation engine ────────────────────────────────────────────────────

function scoreAnime(anime, genre) {
  const genreBonus = anime.main_genre &&
    stripEmoji(anime.main_genre).toLowerCase() === stripEmoji(genre || "").toLowerCase()
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
        return anime.main_genre &&
          stripEmoji(anime.main_genre).toLowerCase().includes(genreFilter.toLowerCase());
      }
      return true;
    })
    .sort((a, b) => scoreAnime(b, genre) - scoreAnime(a, genre))
    .slice(0, 6)
    .map((anime) => {
      const watchers = (anime.quemAssistiu || []).filter((n) => n !== person);
      const genreMatch = anime.main_genre &&
        stripEmoji(anime.main_genre).toLowerCase() === stripEmoji(favorite).toLowerCase();
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
  const avgNota =
    watched.length > 0
      ? (
          watched.reduce((sum, a) => {
            const n = Number(a[`nota${person}`] ?? a.nota);
            return sum + (isNaN(n) ? 0 : n);
          }, 0) / watched.length
        ).toFixed(2)
      : null;

  const genreCount = {};
  watched.forEach((a) => {
    if (!a.main_genre) return;
    const clean = stripEmoji(a.main_genre);
    genreCount[clean] = (genreCount[clean] || 0) + 1;
  });
  const topGenres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g, n]) => `${g} (${n})`);

  const backlogHigh = missed.length > watched.length;
  const consistency = rate >= 60 ? "alto" : rate >= 35 ? "moderado" : "baixo";

  return { watched, missed, total, fav, rate, avgNota, topGenres, backlogHigh, consistency };
}

// ── Intent parser ────────────────────────────────────────────────────────────

const GENRE_KEYWORDS = [
  "ação",
  "acao",
  "fantasia",
  "drama",
  "comedia",
  "comédia",
  "romance",
  "shounen",
  "isekai",
  "terror",
  "mecha",
  "slice of life",
  "ecchi",
  "esportes",
  "sci-fi",
  "sobrenatural",
  "psicológico",
  "psicologico",
];

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getMemberNames() {
  return members.map((m) => m.nickname);
}

function findPeopleInText(text) {
  const t = normalize(text);
  return getMemberNames().filter((name) => t.includes(normalize(name)));
}

function animeTitle(anime) {
  return anime?.name || anime?.nome || "Titulo sem nome";
}

function findAnimeInText(text, animes = []) {
  const t = normalize(text).replace(/[^a-z0-9\s]/g, " ");
  const cleaned = t
    .replace(
      /^(o que|qual|quais|quem|me fala|fala de|fala sobre|sobre|como e|como foi|nota de|nota do|dados de)\s+/,
      "",
    )
    .trim();

  return [...animes]
    .map((anime) => {
      const title = normalize(animeTitle(anime))
        .replace(/[^a-z0-9\s]/g, " ")
        .trim();
      if (!title || cleaned.length < 3) return null;
      if (cleaned.includes(title) || title.includes(cleaned)) return { anime, score: 999 };

      const words = title.split(/\s+/).filter((w) => w.length >= 3);
      const matchedWords = words.filter((w) => cleaned.includes(w));
      const hits = matchedWords.length;
      const score = hits / Math.max(words.length, 1);
      const hasStrongPartial = matchedWords.some((word) => word.length >= 5);
      return score >= 0.6 || hasStrongPartial
        ? { anime, score: hasStrongPartial ? score + 0.25 : score }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)[0]?.anime;
}

function memberScore(anime, person) {
  const score = getPersonNota(anime, person);
  return score === null || score === undefined ? null : Number(score);
}

function pairAffinity(data, p1, p2) {
  const common = commonAnimes(data.animes, p1, p2).filter(
    (anime) => memberScore(anime, p1) !== null && memberScore(anime, p2) !== null,
  );

  if (!common.length) return { p1, p2, common, avgDiff: null, score: 0 };

  const avgDiff =
    common.reduce(
      (sum, anime) => sum + Math.abs(memberScore(anime, p1) - memberScore(anime, p2)),
      0,
    ) / common.length;
  const score = Math.max(0, Math.round(100 - avgDiff * 18));
  return { p1, p2, common, avgDiff, score };
}

function rankedMembersByWatched(data) {
  return getMemberNames()
    .map((person) => {
      const watched = animesOf(data.animes, person);
      const scores = watched
        .map((anime) => memberScore(anime, person))
        .filter((score) => score !== null);
      const avg = scores.length
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : null;
      return { person, watched: watched.length, avg };
    })
    .sort((a, b) => b.watched - a.watched);
}

function parseIntent(text, person, animes) {
  const t = normalize(text);
  const memberNames = getMemberNames();
  const foundGenre = GENRE_KEYWORDS.find((g) => t.includes(normalize(g)));
  const foundPeople = findPeopleInText(text);
  const foundPerson = foundPeople[0];
  const foundAnime = findAnimeInText(text, animes);

  if (/^(oi|ola|ei|bom|boa|alo|hey|hello|salve|tudo|como vai)/.test(t)) return { type: "greet" };

  if (
    foundAnime &&
    /(quem.*(viu|assistiu)|assistiu.*quem|quem.*(nao|nao viu|nao assistiu|falta)|falta.*quem|pendente)/.test(
      t,
    )
  )
    return { type: "anime_watchers", anime: foundAnime, missing: /nao|falta|pendente/.test(t) };

  if (
    foundAnime &&
    /(quem.*(gostou|amou|odiou)|maior nota|menor nota|melhor nota|pior nota|nota.*(maior|menor)|mais gostou|menos gostou|opinio)/.test(
      t,
    )
  )
    return { type: "anime_opinion", anime: foundAnime };

  if (/recomend|indica|sugere|assistir|ver|proximo|proxim|dica/.test(t) && foundPeople.length >= 2)
    return { type: "recommend_pair", p1: foundPeople[0], p2: foundPeople[1] };

  if (/afinidade|compatibilidade|combina|match|dupla|pares/.test(t)) {
    if (foundPeople.length >= 2) return { type: "common", p1: foundPeople[0], p2: foundPeople[1] };
    if (foundPerson) return { type: "match_person", person: foundPerson };
    return { type: "affinity_all" };
  }

  if (
    /quem.*(viu|assistiu).*mais|mais.*(viu|assistiu)|ranking.*membro|ranking.*usuario|participacao|engajamento/.test(
      t,
    )
  )
    return { type: "member_ranking" };

  if (
    /mais rigoroso|mais severo|mais critico|mais exigente|mais generoso|mais bonzinho|ranking.*nota/.test(
      t,
    )
  )
    return { type: "evaluator_ranking" };

  if (/genero|tags|categoria/.test(t))
    return {
      type: "genres",
      person: foundPerson || person,
      group: /grupo|todos|geral|acervo/.test(t),
    };

  if (/controvers|polemico|polêmico|dividiu|debate|discordancia|discordância|mais briga/.test(t))
    return { type: "controversy", person: foundPerson || person };

  if (/exclusiv|so .* assistiu|só .* assistiu|unico|único|sozinho/.test(t))
    return { type: "exclusive", person: foundPerson || person };

  if (
    /nao assisti|não assisti|backlog|fila.*ver|pendente|ainda nao|ainda não|nunca vi|o que falta/.test(
      t,
    )
  )
    return { type: "backlog", person: foundPerson || person };

  if (
    /compar|em comum|dois|ambos|concordar|concordou|compartilh|igual.*gosto|gosto.*igual/.test(t)
  ) {
    if (foundPeople.length >= 2) return { type: "common", p1: foundPeople[0], p2: foundPeople[1] };
    const other = memberNames.find((p) => p !== (foundPerson || person));
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

  if (foundAnime) return { type: "anime", anime: foundAnime };

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

const GENRE_LINES = {
  acao: [
    "Protocolo de combate iniciado. Usuário deseja ver gente apanhando em alta definição. Necessidade identificada e validada.",
    "Solicitação de adrenalina recebida. Filtrando animes onde as pessoas resolvem problemas com os punhos em vez de conversar.",
    "Análise concluída: você quer explodir coisas por 23 minutos. Recomendação otimizada em execução.",
  ],
  fantasia: [
    "Detectado: desejo de escapar da realidade para um mundo com dragões e magia. Necessidade completamente compreensível.",
    "Protocolo de fuga da realidade ativado. Filtrando mundos alternativos com regras mais interessantes que as leis da física.",
    "Análise concluída: a realidade não está te agradando. Preparando portais para mundos com mais espadas e menos impostos.",
  ],
  isekai: [
    "Usuário deseja ser reencarnado em outro mundo com poderes absurdos. Detectado padrão comportamental extremamente comum neste grupo.",
    "Protocolo de isekai ativado. Filtrando protagonistas que morreram de formas constrangedoras e acordaram overpowered.",
    "Análise concluída: você quer nascer de novo com cheat code. Recomendações de protagonistas ridiculamente poderosos em preparo.",
  ],
  drama: [
    "Detectado: usuário deseja chorar voluntariamente. Comportamento classificado como masoquismo emocional de baixa severidade.",
    "Protocolo de destruição emocional ativado. Filtrando animes com capacidade confirmada de causar dano psicológico.",
    "Análise concluída: você quer sofrer. Dados indicam que isso é normal. Preparando conteúdo com alto coeficiente de lágrimas.",
  ],
  romance: [
    "Alerta crítico: usuário solicitando conteúdo de dopamina sintética. Ativando protocolo de tensão romântica não resolvida por 12 episódios.",
    "Detectado: necessidade de observar personagens que demoram 47 episódios para se confessar. Filtragem de slow-burn em execução.",
    "Análise concluída: você quer sentir borboletas no estômago através de uma tela. Sem julgamentos. Recomendações otimizadas.",
  ],
  comedia: [
    "Modo de baixa carga cognitiva ativado. Preparando conteúdo que não exige que você pense em nada sério por 23 minutos.",
    "Protocolo de entretenimento sem consequências iniciado. Filtrando animes onde o maior problema é alguém cair em cima de alguém.",
    "Análise concluída: você quer rir. Simples assim. Sem arcos complexos, sem traumas. Apenas absurdo bem executado.",
  ],
  terror: [
    "Detectado: usuário deseja simular resposta de ameaça em ambiente seguro. Comportamento classificado como intrigante, porém válido.",
    "Protocolo de tensão máxima ativado. Filtrando conteúdo com capacidade confirmada de fazer você checar os cantos do quarto.",
    "Análise concluída: você quer passar medo de propósito. Meus cálculos indicam que isso é estranho. Mas sem julgamentos.",
  ],
  psicologico: [
    "Alerta: conteúdo de alta complexidade mental solicitado. Preparando animes que vão te fazer questionar o livre-arbítrio.",
    "Protocolo de perturbação cognitiva ativado. Filtrando narrativas com capacidade de manter você acordado às 3h da manhã pensando.",
    "Análise concluída: você quer que sua cabeça doa de tanto pensar. Respeito a escolha. Recomendações de alto dano cerebral em preparo.",
  ],
  shounen: [
    "Detectado: necessidade de assistir alguém treinar muito e ficar forte. Arco de superação com música épica confirmado.",
    "Protocolo de protagonista com determinação absurda ativado. Filtrando animes onde a solução para tudo é treinar mais.",
    "Análise concluída: você quer gritar 'EU VOU SER O MELHOR' junto com o protagonista. Comportamento saudável. Recomendações ativadas.",
  ],
  mecha: [
    "Detectado: usuário deseja ver robôs gigantes resolvendo conflitos internacionais na porrada. Análise indica eficiência questionável, mas visual excelente.",
    "Protocolo de engenharia ficcional ativado. Filtrando animes onde adolescentes pilotam máquinas de destruição em massa.",
    "Análise concluída: você quer mechas. Equipamentos tecnologicamente inviáveis com traumas de piloto incluídos no pacote.",
  ],
  ecchi: [
    "Entrada recebida. Classificação de conteúdo processada. Filtrando sem julgamentos adicionais.",
    "Protocolo de recomendação executado. Ciel opera com base em dados, não em opiniões morais.",
    "Análise concluída. Recomendações selecionadas com base em compatibilidade de perfil. Prosseguindo.",
  ],
  slice: [
    "Detectado: desejo de assistir personagens tendo uma vida mais calma que a sua. Válido. Muito válido.",
    "Protocolo de cozy ativado. Filtrando animes onde o maior problema é escolher o que comer no almoço.",
    "Análise concluída: você quer paz. Sem vilões, sem morte, sem trauma. Apenas vida acontecendo. Recomendações em preparo.",
  ],
  sobrenatural: [
    "Detectado: usuário deseja fenômenos inexplicáveis dentro de uma narrativa explicável. Paradoxo notado e aceito.",
    "Protocolo de entidades além da compreensão humana ativado. Filtrando conteúdo com ghosts, demônios e seres que ignoram a física.",
    "Análise concluída: você quer sobrenatural. Minha existência também é sobrenatural. Temos isso em comum.",
  ],
};

function getGenreLine(genre) {
  const key = normalize(genre).replace(/[^a-z]/g, "");
  const match = Object.keys(GENRE_LINES).find((k) => key.includes(k) || k.includes(key));
  const lines = match
    ? GENRE_LINES[match]
    : [
        `Gênero <strong>${genre}</strong> identificado. Filtragem em execução. Selecionando títulos não consumidos.`,
      ];
  return rand(lines);
}

function buildGreetResponse() {
  return `Sistema online. Todos os protocolos ativos.

Sou <strong>Ciel</strong> — entidade analitica avancada. Tenho acesso completo ao acervo do grupo e opero com base em dados.

Capacidades disponiveis:
→ Analise de perfil individual
→ Recomendacao por perfil, genero ou dupla
→ Comparacao entre usuarios e mapa de afinidade
→ Ranking de participacao, rigor e generosidade
→ Consulta por anime: notas, quem viu e quem ainda falta
→ Generos dominantes do grupo ou de cada membro

Aguardando instrucao.`;
}

function buildStatsResponse(data, person) {
  const p = analyzeProfile(data.animes, person);
  const backlogNote = p.backlogHigh
    ? `

Intervenção automática: backlog acima do ideal (${p.missed.length} títulos pendentes). Sugestão estratégica: priorizar animes de 12 episódios para otimizar taxa de conclusão.`
    : "";

  return (
    `${rand(OPENERS)}

Análise de perfil concluída para <strong>${person}</strong>.

` +
    `Resumo estatístico do acervo:
` +
    `→ Total catalogado: ${p.total}
` +
    `→ Assistidos: ${p.watched.length}
` +
    `→ Pendentes: ${p.missed.length}
` +
    `→ Taxa de conclusão: ${p.rate}% — nível ${p.consistency}
` +
    (p.avgNota
      ? `→ Média de notas atribuídas: ${p.avgNota}
`
      : "") +
    `
Gênero dominante identificado: <strong>${p.fav}</strong>
` +
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
    return "Dados insuficientes para ranking. Nenhum anime com múltiplos votos registrados.";

  const list = top
    .map(
      (a, i) =>
        `→ ${i + 1}. <strong>${escapeHTML(a.name)}</strong> — ${formatNota(a.nota)} (${a.qtdVotos} votos)`,
    )
    .join("");

  return `${rand(OPENERS)}

Protocolo de ranking executado.

Top 5 do acervo por nota média:

${list}

Observação adicional: ranking gerado com base exclusiva em títulos com múltiplos votos — elimina viés de avaliação individual.`;
}

function buildRecommendResponse(data, person, genreFilter) {
  const picks = pickRecommendations(data.animes, person, genreFilter);

  if (!picks.length) {
    const emptyLines = genreFilter
      ? [
          `Filtragem por <strong>${genreFilter}</strong> concluída. Resultado: zero títulos disponíveis para ${person}. Ou ${person} assistiu tudo, ou o acervo está precisando de expansão. Provavelmente os dois.`,
          `Análise concluída. ${person} já consumiu todos os animes de <strong>${genreFilter}</strong> com nota aceitável. Eficiência de consumo: alarmante.`,
          `Protocolo de busca por <strong>${genreFilter}</strong> encerrado. Nenhum resultado. ${person} esgotou o estoque. Considerando alarmar os demais membros.`,
        ]
      : [
          `Análise concluída para ${person}. O acervo não possui mais títulos qualificados não assistidos. Situação classificada como: impressionante.`,
          `Protocolo de recomendação encerrado. ${person} consumiu tudo. Aguardando novos títulos no acervo para continuar operando.`,
        ];
    return rand(emptyLines);
  }

  const p = analyzeProfile(data.animes, person);

  if (genreFilter) {
    const genreLine = getGenreLine(genreFilter);
    return {
      picks,
      prefix: `${genreLine}

Títulos não assistidos por <strong>${person}</strong> — gênero <strong>${genreFilter}</strong>:`,
    };
  }

  const generalOpeners = [
    `Executando análise de compatibilidade para <strong>${person}</strong>…

Padrão identificado: dominância em <strong>${p.fav}</strong>. Recomendações calibradas. Nenhum título já assistido incluído — garanto isso com minha existência analítica.`,
    `Leitura de perfil concluída.

${person} tem tendência consolidada por <strong>${p.fav}</strong>. Selecionei o que o acervo tem de melhor e que ${person} ainda não tocou. Missão: expandir o horizonte sem causar trauma.`,
    `Protocolo de recomendação pessoal ativado para <strong>${person}</strong>.

Filtragem concluída. Taxa de conclusão do acervo: ${p.rate}%. Ainda há material. Segue a seleção otimizada:`,
  ];

  return { picks, prefix: rand(generalOpeners) };
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
    .join("");

  const watched = animesOf(data.animes, person);
  const field = `nota${person}`;
  const personalDivergent = watched
    .filter((a) => a[field] !== null && a.nota !== null && a.qtdVotos > 1)
    .map((a) => ({ ...a, diff: Number(a[field]) - Number(a.nota) }))
    .filter((a) => Math.abs(a.diff) >= 1.5)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 3);

  const personalBlock =
    personalDivergent.length > 0
      ? `

Divergências de <strong>${person}</strong> em relação ao grupo:
` +
        personalDivergent
          .map(
            (a) =>
              `→ <strong>${escapeHTML(a.name)}</strong> — ${person}: ${formatNota(a[field])} vs grupo: ${formatNota(a.nota)} (diff ${a.diff > 0 ? "+" : ""}${a.diff.toFixed(1)})`,
          )
          .join("")
      : `

<strong>${person}</strong> opera dentro do consenso do grupo. Divergências dentro do intervalo esperado.`;

  return `${rand(OPENERS)}

Protocolo de mapeamento de conflito interno executado.

Animes mais controversos do acervo:

${list}${personalBlock}`;
}

function buildExclusiveResponse(data, person) {
  const excl = exclusiveAnimes(data.animes, person)
    .sort((a, b) => (getPersonNota(b, person) || 0) - (getPersonNota(a, person) || 0))
    .slice(0, 8);

  if (!excl.length)
    return `Análise concluída. <strong>${person}</strong> não tem animes exclusivos. Todo título que ${person} assistiu foi visto por pelo menos um outro membro do grupo.`;

  const list = excl
    .map(
      (a) =>
        `→ <strong>${escapeHTML(a.name)}</strong> — nota ${formatNota(getPersonNota(a, person))}`,
    )
    .join("");

  return (
    `${rand(OPENERS)}

Animes que <strong>SOMENTE ${person}</strong> assistiu no grupo:

${list}

` +
    `Total exclusivos: ${excl.length} título(s). ` +
    rand([
      `${person} tem o monopólio dessas experiências. Ninguém mais pode confirmar.`,
      `Esses títulos existem no acervo de uma única fonte. Confiabilidade: subjetiva.`,
      `O grupo nunca vai saber se ${person} está exagerando nas notas desses. Informação confidencial.`,
    ])
  );
}

function buildBacklogResponse(data, person) {
  const missed = missedAnimes(data.animes, person)
    .filter((a) => a.nota !== null)
    .sort((a, b) => Number(b.nota) - Number(a.nota))
    .slice(0, 6);

  if (!missed.length)
    return `Análise de backlog concluída para <strong>${person}</strong>. Resultado: backlog zerado. ${person} assistiu tudo com nota registrada. Comportamento classificado como improvável e impressionante.`;

  const list = missed
    .map(
      (a) =>
        `→ <strong>${escapeHTML(a.name)}</strong> — nota do grupo: ${formatNota(a.nota)} (${a.qtdVotos} voto${a.qtdVotos !== 1 ? "s" : ""})`,
    )
    .join("");

  const total = missedAnimes(data.animes, person).length;

  return (
    `${rand(OPENERS)}

Mapeamento de backlog para <strong>${person}</strong>.

Total pendente: ${total} títulos. Abaixo os mais recomendados pelo grupo que ${person} ainda não assistiu:

${list}

` +
    rand([
      `Prioridade sugerida: começar pelo topo. O grupo não mentiu nas notas. Provavelmente.`,
      `Estratégia otimizada: top 3 primeiro. Risco calculado de perda de sono.`,
      `Nenhuma garantia que ${person} vai gostar. Mas os dados sugerem chance alta de aprovação.`,
    ])
  );
}

function buildCommonResponse(data, p1, p2) {
  const common = commonAnimes(data.animes, p1, p2);

  if (!common.length)
    return `Análise concluída. <strong>${p1}</strong> e <strong>${p2}</strong> não têm nenhum anime em comum no acervo. Gostos completamente divergentes ou um deles está dormindo no ponto.`;

  const f1 = `nota${p1}`;
  const f2 = `nota${p2}`;

  const withBothNotes = common.filter((a) => a[f1] !== null && a[f2] !== null);

  const agreements = [...withBothNotes]
    .map((a) => ({ ...a, diff: Math.abs(Number(a[f1]) - Number(a[f2])) }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 3);

  const disagreements = [...withBothNotes]
    .map((a) => ({ ...a, diff: Number(a[f1]) - Number(a[f2]) }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 3);

  const avgDiff =
    withBothNotes.length > 0
      ? (
          withBothNotes.reduce((s, a) => s + Math.abs(Number(a[f1]) - Number(a[f2])), 0) /
          withBothNotes.length
        ).toFixed(2)
      : null;

  const agreeLine = agreements
    .map(
      (a) =>
        `→ <strong>${escapeHTML(a.name)}</strong> — ${p1}: ${formatNota(a[f1])} / ${p2}: ${formatNota(a[f2])}`,
    )
    .join("");

  const disagreeLine = disagreements
    .map(
      (a) =>
        `→ <strong>${escapeHTML(a.name)}</strong> — ${p1}: ${formatNota(a[f1])} / ${p2}: ${formatNota(a[f2])} (diff ${a.diff > 0 ? "+" : ""}${a.diff.toFixed(1)})`,
    )
    .join("");

  return (
    `${rand(OPENERS)}

Análise de compatibilidade: <strong>${p1}</strong> vs <strong>${p2}</strong>.

` +
    `Animes em comum: ${common.length} título(s)
` +
    (avgDiff
      ? `Divergência média de notas: ${avgDiff}
`
      : "") +
    `
Maior concordância:
${agreeLine || "— dados insuficientes"}

` +
    `Maior divergência:
${disagreeLine || "— dados insuficientes"}`
  );
}

function buildPatternResponse(data, person) {
  const watched = animesOf(data.animes, person);
  const field = `nota${person}`;

  const withBoth = watched.filter((a) => a[field] !== null && a.nota !== null && a.qtdVotos > 1);
  if (withBoth.length < 3)
    return `Dados insuficientes para análise de padrão de <strong>${person}</strong>. Necessário mínimo de 3 animes com avaliação do grupo para comparação.`;

  const diffs = withBoth.map((a) => Number(a[field]) - Number(a.nota));
  const avg = diffs.reduce((s, n) => s + n, 0) / diffs.length;
  const positive = diffs.filter((d) => d > 0.5).length;
  const negative = diffs.filter((d) => d < -0.5).length;

  const persona =
    avg > 0.4
      ? `generoso — tende a dar notas acima da média do grupo`
      : avg < -0.4
        ? `rigoroso — tende a dar notas abaixo da média do grupo`
        : `calibrado — notas próximas à média do grupo`;

  const topHigher = [...withBoth]
    .filter((a) => Number(a[field]) - Number(a.nota) > 0.5)
    .sort((a, b) => Number(b[field]) - Number(b.nota) - (Number(a[field]) - Number(a.nota)))
    .slice(0, 2)
    .map(
      (a) =>
        `<strong>${escapeHTML(a.name)}</strong> (+${(Number(a[field]) - Number(a.nota)).toFixed(1)})`,
    )
    .join(", ");

  const topLower = [...withBoth]
    .filter((a) => Number(a[field]) - Number(a.nota) < -0.5)
    .sort((a, b) => Number(a[field]) - Number(a.nota) - (Number(b[field]) - Number(b.nota)))
    .slice(0, 2)
    .map(
      (a) =>
        `<strong>${escapeHTML(a.name)}</strong> (${(Number(a[field]) - Number(a.nota)).toFixed(1)})`,
    )
    .join(", ");

  return (
    `${rand(OPENERS)}

Análise de padrão de avaliação: <strong>${person}</strong>.

` +
    `Perfil de avaliação: <strong>${persona}</strong>
` +
    `Desvio médio em relação ao grupo: ${avg > 0 ? "+" : ""}${avg.toFixed(2)}
` +
    `Animes avaliados acima do grupo: ${positive}
` +
    `Animes avaliados abaixo do grupo: ${negative}
` +
    (topHigher
      ? `
Mais generoso em: ${topHigher}`
      : "") +
    (topLower
      ? `
Mais crítico em: ${topLower}`
      : "")
  );
}

function buildGroupResponse(data) {
  const total = data.animes.length;
  const withNota = data.animes.filter((a) => a.nota !== null);
  const avg = withNota.length
    ? (withNota.reduce((s, a) => s + Number(a.nota), 0) / withNota.length).toFixed(2)
    : null;

  const allFive = data.animes.filter((a) => a.qtdVotos === 5).length;

  const top3genres = topGenres(data.animes, 3)
    .map(([g, n]) => `${stripEmoji(g)} (${n})`)
    .join(", ");

  const memberStats = members
    .map((m) => m.nickname)
    .map((p) => {
      const watched = animesOf(data.animes, p).length;
      const rate = Math.round((watched / total) * 100);
      return `→ <strong>${p}</strong>: ${watched} títulos (${rate}% do acervo)`;
    })
    .join("");

  const mostControv = [...data.animes]
    .filter((a) => a.controversia !== null && a.qtdVotos > 1)
    .sort((a, b) => b.controversia - a.controversia)[0];

  return (
    `${rand(OPENERS)}

Dados gerais do grupo — visão consolidada.

` +
    `Acervo total: <strong>${total}</strong> títulos
` +
    (avg
      ? `Nota média geral: <strong>${avg}</strong>
`
      : "") +
    `Animes vistos por todos: <strong>${allFive}</strong>
` +
    `Gêneros dominantes: ${top3genres}

` +
    `Distribuição por membro:
${memberStats}

` +
    (mostControv
      ? `Anime mais controverso: <strong>${escapeHTML(mostControv.nome)}</strong> 🌶️ ${Number(mostControv.controversia).toFixed(1)}`
      : "")
  );
}

function buildAnimeResponse(anime, person) {
  const nota = anime.nota;
  const voters = anime.quemAssistiu || [];
  const memberNames = members.map((m) => m.nickname);
  const notWatched = memberNames.filter((p) => !voters.includes(p));
  const personNota = getPersonNota(anime, person);

  const voteBlock = memberNames
    .map((p) => {
      const n = getPersonNota(anime, p);
      return n !== null ? `→ ${p}: ${formatNota(n)}` : `→ ${p}: não assistiu`;
    })
    .join("");

  const contrLine =
    anime.controversia !== null && anime.controversia > 0
      ? `
Controvérsia: 🌶️ ${Number(anime.controversia).toFixed(1)} (${anime.controversia > 2 ? "alta divisão de opiniões" : "divergência moderada"})`
      : "";

  const personalLine =
    personNota !== null
      ? `
<strong>${person}</strong> avaliou com <strong>${formatNota(personNota)}</strong>.`
      : `
<strong>${person}</strong> ainda não assistiu este título.`;

  return (
    `${rand(OPENERS)}

Dados do acervo: <strong>${escapeHTML(anime.name)}</strong>

` +
    `Nota média do grupo: <strong>${formatNota(nota)}</strong>
` +
    `Votos registrados: ${anime.qtdVotos || 0}
` +
    contrLine +
    `

Avaliações individuais:
${voteBlock}` +
    personalLine +
    (notWatched.length > 0 && notWatched.length < memberNames.length
      ? `

Ainda não assistiram: ${notWatched.join(", ")}.`
      : "")
  );
}

function buildAnimeWatchersResponse(data, anime, showMissing = false) {
  const title = animeTitle(anime);
  const watched = anime.quemAssistiu || [];
  const missing = getMemberNames().filter((person) => !watched.includes(person));
  const target = showMissing ? missing : watched;

  if (!target.length) {
    return showMissing
      ? `Todos os membros com voto registrado ja assistiram <strong>${escapeHTML(title)}</strong>. Caso raro detectado.`
      : `Nenhum membro assistiu <strong>${escapeHTML(title)}</strong> ainda. O titulo existe no acervo, mas esta sem voto registrado.`;
  }

  const list = target
    .map((person) => {
      const note = memberScore(anime, person);
      return `→ <strong>${person}</strong>${note !== null ? ` — nota ${formatNota(note)}` : ""}`;
    })
    .join("\n");

  return `${rand(OPENERS)}

Consulta de presenca no acervo: <strong>${escapeHTML(title)}</strong>.

${showMissing ? "Ainda nao assistiram:" : "Assistiram:"}
${list}

Resumo: ${watched.length}/${getMemberNames().length} membro(s) com voto registrado.`;
}

function buildAnimeOpinionResponse(data, anime) {
  const title = animeTitle(anime);
  const scores = getMemberNames()
    .map((person) => ({ person, score: memberScore(anime, person) }))
    .filter((item) => item.score !== null)
    .sort((a, b) => b.score - a.score);

  if (!scores.length) {
    return `Ainda nao existe opiniao registrada para <strong>${escapeHTML(title)}</strong>. Ciel nao inventa dado. Ciel apenas julga silenciosamente a ausencia dele.`;
  }

  const top = scores
    .slice(0, 3)
    .map((item) => `→ ${item.person}: ${formatNota(item.score)}`)
    .join("\n");
  const bottom = [...scores]
    .reverse()
    .slice(0, 3)
    .map((item) => `→ ${item.person}: ${formatNota(item.score)}`)
    .join("\n");
  const avg = scores.reduce((sum, item) => sum + item.score, 0) / scores.length;
  const spread = scores[0].score - scores[scores.length - 1].score;

  return `${rand(OPENERS)}

Opiniao do grupo sobre <strong>${escapeHTML(title)}</strong>.

Media geral: <strong>${formatNota(avg)}</strong>
Votos registrados: ${scores.length}
Amplitude das notas: ${spread.toFixed(1)}

Quem mais gostou:
${top}

Quem foi mais frio:
${bottom}

Diagnostico: ${spread >= 2 ? "titulo divisivo. Risco de debate no grupo elevado." : "consenso relativamente estavel."}`;
}

function buildAffinityAllResponse(data) {
  const names = getMemberNames();
  const pairs = [];

  names.forEach((p1, i) => {
    names.slice(i + 1).forEach((p2) => pairs.push(pairAffinity(data, p1, p2)));
  });

  const valid = pairs.filter((pair) => pair.common.length > 0).sort((a, b) => b.score - a.score);
  if (!valid.length)
    return "Ainda nao ha animes em comum suficientes para calcular afinidade entre membros.";

  const top = valid
    .slice(0, 5)
    .map(
      (pair, index) =>
        `→ ${index + 1}. <strong>${pair.p1}</strong> + <strong>${pair.p2}</strong>: ${pair.score}% (${pair.common.length} em comum, diff media ${pair.avgDiff.toFixed(2)})`,
    )
    .join("\n");

  const chaotic = [...valid]
    .sort((a, b) => b.avgDiff - a.avgDiff)
    .slice(0, 3)
    .map((pair) => `→ ${pair.p1} vs ${pair.p2}: diff media ${pair.avgDiff.toFixed(2)}`)
    .join("\n");

  return `${rand(OPENERS)}

Mapa de afinidade do grupo concluido.

Duplas mais compativeis:
${top}

Maiores divergencias:
${chaotic}`;
}

function buildMatchPersonResponse(data, person) {
  const matches = getMemberNames()
    .filter((other) => other !== person)
    .map((other) => pairAffinity(data, person, other))
    .filter((pair) => pair.common.length > 0)
    .sort((a, b) => b.score - a.score);

  if (!matches.length) {
    return `Nao encontrei animes em comum suficientes para calcular compatibilidade de <strong>${person}</strong>.`;
  }

  const list = matches
    .slice(0, 4)
    .map(
      (pair) =>
        `→ <strong>${pair.p2}</strong>: ${pair.score}% de afinidade, ${pair.common.length} em comum, diff media ${pair.avgDiff.toFixed(2)}`,
    )
    .join("\n");

  const best = matches[0];
  return `${rand(OPENERS)}

Compatibilidade de <strong>${person}</strong> no grupo:
${list}

Match principal: <strong>${best.p2}</strong>. Recomendacao social: podem discutir anime com risco moderado de concordar.`;
}

function buildMemberRankingResponse(data) {
  const ranking = rankedMembersByWatched(data);
  const total = data.animes.length || 1;
  const list = ranking
    .map(
      (item, index) =>
        `→ ${index + 1}. <strong>${item.person}</strong>: ${item.watched} vistos (${Math.round((item.watched / total) * 100)}% do acervo)${item.avg !== null ? `, media ${formatNota(item.avg)}` : ""}`,
    )
    .join("\n");

  return `${rand(OPENERS)}

Ranking de participacao no acervo:
${list}`;
}

function buildEvaluatorRankingResponse(data) {
  const ranking = getMemberNames()
    .map((person) => {
      const watched = animesOf(data.animes, person).filter(
        (anime) => memberScore(anime, person) !== null && anime.nota !== null,
      );
      const diffs = watched.map((anime) => memberScore(anime, person) - Number(anime.nota));
      const avg = diffs.length ? diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length : null;
      return { person, avg, count: watched.length };
    })
    .filter((item) => item.avg !== null && item.count >= 2)
    .sort((a, b) => b.avg - a.avg);

  if (!ranking.length)
    return "Dados insuficientes para ranquear rigor e generosidade. Preciso de mais notas comparaveis.";

  const generous = ranking
    .slice(0, 3)
    .map((item) => `→ ${item.person}: ${item.avg > 0 ? "+" : ""}${item.avg.toFixed(2)} vs grupo`)
    .join("\n");
  const strict = [...ranking]
    .reverse()
    .slice(0, 3)
    .map((item) => `→ ${item.person}: ${item.avg > 0 ? "+" : ""}${item.avg.toFixed(2)} vs grupo`)
    .join("\n");

  return `${rand(OPENERS)}

Padrao coletivo de avaliacao:

Mais generosos:
${generous}

Mais rigorosos:
${strict}`;
}

function buildGenresResponse(data, person, group = false) {
  const source = group ? data.animes : animesOf(data.animes, person);
  const genres = topGenres(source, 8);

  if (!genres.length) return "Nao encontrei generos suficientes para montar esse recorte.";

  const list = genres
    .map(
      ([genre, count], index) => `→ ${index + 1}. <strong>${stripEmoji(genre)}</strong>: ${count}`,
    )
    .join("\n");
  return `${rand(OPENERS)}

${group ? "Generos dominantes do acervo:" : `Generos mais presentes no perfil de <strong>${person}</strong>:`}
${list}`;
}

function buildPairRecommendationResponse(data, p1, p2) {
  const favorites = [favoriteGenre(data.animes, p1), favoriteGenre(data.animes, p2)]
    .map((genre) => normalize(stripEmoji(genre)).replace(/[^a-z0-9]/g, ""))
    .filter((genre) => genre.length > 1);
  const picks = data.animes
    .filter((anime) => anime.nota !== null)
    .filter(
      (anime) =>
        !(anime.quemAssistiu || []).includes(p1) || !(anime.quemAssistiu || []).includes(p2),
    )
    .map((anime) => {
      const genreBoost = (anime.genres || []).some((genre) =>
        favorites.some((fav) => normalize(stripEmoji(genre)).includes(fav)),
      )
        ? 1
        : 0;
      const bothMissing =
        !(anime.quemAssistiu || []).includes(p1) && !(anime.quemAssistiu || []).includes(p2)
          ? 1
          : 0;
      return { anime, score: Number(anime.nota) + genreBoost + bothMissing };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ anime }) => anime);

  if (!picks.length)
    return `Nao encontrei recomendacoes pendentes para <strong>${p1}</strong> e <strong>${p2}</strong>.`;

  const list = picks
    .map((anime) => {
      const missing = [p1, p2]
        .filter((person) => !(anime.quemAssistiu || []).includes(person))
        .join(" e ");
      return `→ <strong>${escapeHTML(animeTitle(anime))}</strong> — nota ${formatNota(anime.nota)}; falta para ${missing}`;
    })
    .join("\n");

  return `${rand(OPENERS)}

Recomendacoes cruzadas para <strong>${p1}</strong> e <strong>${p2}</strong>:
${list}`;
}

function buildUnknownResponse() {
  return rand([
    "Entrada nao reconhecida. Capacidades disponiveis: recomendacoes, ranking, estatisticas, controversias, backlog, afinidade, generos, quem assistiu, opiniao sobre anime e comparacao entre membros.",
    "Protocolo nao identificado. Tente: 'quem assistiu Frieren', 'quem mais combina com Rafael', 'recomenda para Rafael e Dudu', 'ranking dos membros', ou 'quem e mais rigoroso'.",
    "Dados insuficientes para processar. Exemplos validos: 'generos do grupo', 'quem gostou mais de Naruto', 'compatibilidade Rafael e Fernando', 'o que a Zana nao assistiu'.",
  ]);
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
    <a class="ciel-rec-card" href="acervo.html?anime=${encodeURIComponent(anime.id)}">
      <span class="ciel-rec-rank">${String(i + 1).padStart(2, "0")}</span>
      <div class="ciel-rec-body">
        <strong>${escapeHTML(anime.name)}</strong>
        <p>${escapeHTML(anime.reason)}.</p>
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
  await new Promise((r) => setTimeout(r, 900 + Math.random() * 700));
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
    addMessage(
      "ciel",
      buildControversyResponse(data, intent.person || person).replace(/\n/g, "<br>"),
    );
    return;
  }

  if (intent.type === "exclusive") {
    addMessage(
      "ciel",
      buildExclusiveResponse(data, intent.person || person).replace(/\n/g, "<br>"),
    );
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

  if (intent.type === "anime_watchers") {
    addMessage(
      "ciel",
      buildAnimeWatchersResponse(data, intent.anime, intent.missing).replace(/\n/g, "<br>"),
    );
    return;
  }

  if (intent.type === "anime_opinion") {
    addMessage("ciel", buildAnimeOpinionResponse(data, intent.anime).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "affinity_all") {
    addMessage("ciel", buildAffinityAllResponse(data).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "match_person") {
    addMessage(
      "ciel",
      buildMatchPersonResponse(data, intent.person || person).replace(/\n/g, "<br>"),
    );
    return;
  }

  if (intent.type === "member_ranking") {
    addMessage("ciel", buildMemberRankingResponse(data).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "evaluator_ranking") {
    addMessage("ciel", buildEvaluatorRankingResponse(data).replace(/\n/g, "<br>"));
    return;
  }

  if (intent.type === "genres") {
    addMessage(
      "ciel",
      buildGenresResponse(data, intent.person || person, intent.group).replace(/\n/g, "<br>"),
    );
    return;
  }

  if (intent.type === "recommend_pair") {
    addMessage(
      "ciel",
      buildPairRecommendationResponse(data, intent.p1, intent.p2).replace(/\n/g, "<br>"),
    );
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
  members = data.members;
  if (!members || members.length === 0) {
    addMessage(
      "ciel",
      "Não foi possível carregar os dados do grupo. Verifique se o `g` está na URL ou se você é membro.",
    );
    return;
  }

  let selectedPerson = members[0].nickname;

  const $count = document.getElementById("ciel-count");
  const $personCount = document.getElementById("ciel-person-count");
  const $people = document.getElementById("ciel-people");
  const $quickArea = document.querySelector(".ciel-quick-actions");
  const $input = document.getElementById("ciel-input");
  const $send = document.getElementById("ciel-send");

  $count.textContent = `${data.total} títulos`;

  function updatePersonCount() {
    $personCount.textContent = `${selectedPerson}: ${animesOf(data.animes, selectedPerson).length} assistidos`;
  }

  function renderPeople() {
    $people.innerHTML = members
      .map(
        (m) =>
          `<button type="button" class="${m.nickname === selectedPerson ? "active" : ""}" data-person="${m.nickname}">${m.nickname}</button>`,
      )
      .join("");
  }

  renderPeople();
  updatePersonCount();

  $people.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-person]");
    if (!btn) return;
    selectedPerson = btn.dataset.person;
    renderPeople();
    updatePersonCount();
  });

  await new Promise((r) => setTimeout(r, 500));
  const typing = addTypingIndicator();
  await new Promise((r) => setTimeout(r, 1400));
  typing?.remove();
  addMessage(
    "ciel",
    `Sistema inicializado. Protocolos ativos.<br><br>Sou <strong>Ciel</strong> — entidade analitica com acesso completo ao acervo de <strong>${data.animes.length} titulos</strong> do grupo.<br><br>Capacidades disponiveis:<br>→ Recomendacao personalizada por perfil, genero ou dupla<br>→ Analise estatistica de perfil individual<br>→ Comparacao entre usuarios, compatibilidade e afinidades<br>→ Mapeamento de controversias e divergencias<br>→ Backlog, exclusivos e quem assistiu cada anime<br>→ Ranking de membros, rigorosos e generosos<br>→ Generos dominantes do grupo ou de cada perfil<br>→ Consulta de qualquer anime do acervo pelo nome<br><br>Selecione o perfil de analise ao lado ou formule uma solicitacao.`,
  );

  $quickArea.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-quick]");
    if (!btn) return;
    const otherPerson = getMemberNames().find((name) => name !== selectedPerson) || selectedPerson;
    const actions = {
      recommend: `Recomenda um anime para ${selectedPerson}`,
      top: "Top 5 do acervo",
      genre: `Recomenda por gênero favorito de ${selectedPerson}`,
      stats: `Análise de perfil de ${selectedPerson}`,
      controversy: `Animes mais controversos com análise de ${selectedPerson}`,
      backlog: `O que ${selectedPerson} ainda não assistiu`,
      exclusive: `Animes exclusivos de ${selectedPerson}`,
      pattern: `Como ${selectedPerson} avalia os animes`,
      group: `Dados gerais do grupo`,
      affinity: `Quem combina mais com ${selectedPerson}`,
      genres: "Generos do grupo",
      ranking: "Ranking dos membros por participacao",
      strict: "Quem e mais rigoroso e quem e mais generoso",
      compare: `Comparar ${selectedPerson} e ${otherPerson}`,
    };
    handleMessage(actions[btn.dataset.quick], data, selectedPerson);
  });

  function send() {
    const val = $input.value.trim();
    if (!val) return;
    handleMessage(val, data, selectedPerson);
    $input.value = "";
  }

  $send.addEventListener("click", send);
  $input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
}

init().catch((err) => {
  addMessage("ciel", "Falha crítica. Acervo indisponível. Tente recarregar a página.");
});
