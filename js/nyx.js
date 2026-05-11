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
} from "./data.js?v=desafios-soft-1";
import { escapeHTML, stripEmoji } from "./utils.js";

let members = [];

// ── Recommendation engine ────────────────────────────────────────────────────

function scoreAnime(anime, genre) {
  const genreBonus = (anime.generos || []).some(
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
        return (anime.generos || []).some((g) =>
          stripEmoji(g).toLowerCase().includes(genreFilter.toLowerCase()),
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
    (a.generos || []).forEach((g) => {
      const clean = stripEmoji(g);
      genreCount[clean] = (genreCount[clean] || 0) + 1;
    });
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
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function parseIntent(text, person, animes) {
  const t = normalize(text);
  const memberNames = members.map(m => m.nickname);
  const foundPerson = memberNames.find((p) => t.includes(p.toLowerCase()));
  const foundGenre = GENRE_KEYWORDS.find((g) => t.includes(normalize(g)));
  const foundPeople = memberNames.filter((p) => t.includes(p.toLowerCase()));

  if (/^(oi|ola|ei|bom|boa|alo|hey|hello|salve|tudo|como vai)/.test(t)) return { type: "greet" };

  if (/controvers|polemico|polêmico|dividiu|debate|discordancia|discordância|mais briga/.test(t))
    return { type: "controversy", person: foundPerson || person };

  if (/exclusiv|so .* assistiu|só .* assistiu|unico|único|sozinho/.test(t))
    return { type: "exclusive", person: foundPerson || person };

  if (/nao assisti|não assisti|backlog|fila.*ver|pendente|ainda nao|ainda não|nunca vi|o que falta/.test(t))
    return { type: "backlog", person: foundPerson || person };

  if (/em comum|dois|ambos|concordar|concordou|compartilh|igual.*gosto|gosto.*igual/.test(t)) {
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

Sou <strong>Ciel</strong> — entidade analítica avançada. Tenho acesso completo ao acervo do grupo e opero com base em dados.

Capacidades disponíveis:
→ Análise de perfil individual
→ Recomendação otimizada por compatibilidade
→ Estatísticas e padrões comportamentais
→ Filtro por gênero com justificativa

Aguardando instrução.`;
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
    (p.avgNota ? `→ Média de notas atribuídas: ${p.avgNota}
` : "") +
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

  return (
    `${rand(OPENERS)}

Protocolo de mapeamento de conflito interno executado.

Animes mais controversos do acervo:

${list}${personalBlock}`
  );
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
    .map((a) => `→ <strong>${escapeHTML(a.name)}</strong> — ${p1}: ${formatNota(a[f1])} / ${p2}: ${formatNota(a[f2])}`)
    .join("");

  const disagreeLine = disagreements
    .map((a) => `→ <strong>${escapeHTML(a.name)}</strong> — ${p1}: ${formatNota(a[f1])} / ${p2}: ${formatNota(a[f2])} (diff ${a.diff > 0 ? "+" : ""}${a.diff.toFixed(1)})`)
    .join("");

  return (
    `${rand(OPENERS)}

Análise de compatibilidade: <strong>${p1}</strong> vs <strong>${p2}</strong>.

` +
    `Animes em comum: ${common.length} título(s)
` +
    (avgDiff ? `Divergência média de notas: ${avgDiff}
` : "") +
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
    .sort((a, b) => (Number(b[field]) - Number(b.nota)) - (Number(a[field]) - Number(a.nota)))
    .slice(0, 2)
    .map((a) => `<strong>${escapeHTML(a.name)}</strong> (+${(Number(a[field]) - Number(a.nota)).toFixed(1)})`)
    .join(", ");

  const topLower = [...withBoth]
    .filter((a) => Number(a[field]) - Number(a.nota) < -0.5)
    .sort((a, b) => (Number(a[field]) - Number(a.nota)) - (Number(b[field]) - Number(b.nota)))
    .slice(0, 2)
    .map((a) => `<strong>${escapeHTML(a.name)}</strong> (${(Number(a[field]) - Number(a.nota)).toFixed(1)})`)
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
    (topHigher ? `
Mais generoso em: ${topHigher}` : "") +
    (topLower ? `
Mais crítico em: ${topLower}` : "")
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

  const memberStats = members.map(m => m.nickname).map((p) => {
    const watched = animesOf(data.animes, p).length;
    const rate = Math.round((watched / total) * 100);
    return `→ <strong>${p}</strong>: ${watched} títulos (${rate}% do acervo)`;
  }).join("");

  const mostControv = [...data.animes]
    .filter((a) => a.controversia !== null && a.qtdVotos > 1)
    .sort((a, b) => b.controversia - a.controversia)[0];

  return (
    `${rand(OPENERS)}

Dados gerais do grupo — visão consolidada.

` +
    `Acervo total: <strong>${total}</strong> títulos
` +
    (avg ? `Nota média geral: <strong>${avg}</strong>
` : "") +
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
  const memberNames = members.map(m => m.nickname);
  const notWatched = memberNames.filter((p) => !voters.includes(p));
  const personNota = getPersonNota(anime, person);

  const voteBlock = memberNames.map((p) => {
    const n = getPersonNota(anime, p);
    return n !== null
      ? `→ ${p}: ${formatNota(n)}`
      : `→ ${p}: não assistiu`;
  }).join("");

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

function buildUnknownResponse() {
  return rand([
    "Entrada não reconhecida. Capacidades disponíveis: recomendações, ranking, estatísticas, controvérsias, backlog, animes em comum, padrão de avaliação e busca por anime.",
    "Protocolo não identificado. Tente: 'recomendar para Rafael', 'top do acervo', 'animes em comum Rafael e Dudu', 'backlog do Fernando', 'análise de controvérsia', ou pesquise o nome de um anime.",
    "Dados insuficientes para processar. Exemplos válidos: 'o que o Rafael não assistiu', 'como o Hacksuya avalia', 'animes exclusivos da Zana', 'fala de Frieren'.",
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
  members = data.members;
  if (!members || members.length === 0) {
    addMessage("ciel", "Não foi possível carregar os dados do grupo. Verifique se o `g` está na URL ou se você é membro.");
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
    $people.innerHTML = members.map(
      (m) =>
        `<button type="button" class="${m.nickname === selectedPerson ? "active" : ""}" data-person="${m.nickname}">${m.nickname}</button>`,
    ).join("");
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
    `Sistema inicializado. Protocolos ativos.<br><br>Sou <strong>Ciel</strong> — entidade analítica com acesso completo ao acervo de <strong>${data.animes.length} títulos</strong> do grupo.<br><br>Capacidades disponíveis:<br>→ Recomendação personalizada por perfil ou gênero<br>→ Análise estatística de perfil individual<br>→ Mapeamento de controvérsias e divergências<br>→ Backlog e animes exclusivos por membro<br>→ Padrão de avaliação (generoso vs rigoroso)<br>→ Animes em comum entre dois membros<br>→ Dados consolidados do grupo<br>→ Consulta de qualquer anime do acervo pelo nome<br><br>Selecione o perfil de análise ao lado ou formule uma solicitação.`,
  );

  $quickArea.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-quick]");
    if (!btn) return;
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
