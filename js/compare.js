import {
  animesOf,
  commonAnimes,
  countGenres,
  topGenres,
  cleanGenreLabel,
  getPersonNota,
  getPersonColor,
} from "./data.js";
import { hexToRgba, escapeHTML, shortText } from "./utils.js";

Chart.defaults.color = "#b8c0d9";
Chart.defaults.font.family = "'Poppins', sans-serif";

let allAnimes = [];
let radarChart = null;
let currentMembers = [];

export function initCompare(animes, members) {
  allAnimes = animes || [];
  currentMembers = members || [];

  const person1 = document.getElementById("person1");
  const person2 = document.getElementById("person2");
  if (!person1 || !person2) return;

  populateSelects(person1, person2);

  const handleChange = () => renderCompare();
  person1.onchange = handleChange;
  person2.onchange = handleChange;

  renderCompare();
}

function populateSelects(select1, select2) {
  select1.innerHTML = "";
  select2.innerHTML = "";

  currentMembers.forEach((member, index) => {
    const option1 = document.createElement("option");
    option1.value = member.nickname;
    option1.textContent = member.nickname;
    if (index === 0) option1.selected = true;
    select1.appendChild(option1);

    const option2 = document.createElement("option");
    option2.value = member.nickname;
    option2.textContent = member.nickname;
    if (index === 1 || (currentMembers.length === 1 && index === 0)) option2.selected = true;
    select2.appendChild(option2);
  });
}

function renderCompare() {
  const p1 = document.getElementById("person1")?.value;
  const p2 = document.getElementById("person2")?.value;
  if (!p1 || !p2) return;

  renderAffinityPanel(p1, p2);
  renderSummary(p1, p2);
  renderVenn(p1, p2);
  renderRadar(p1, p2);
  renderCommonTable(p1, p2);
}

function renderSummary(p1, p2) {
  const wrap = document.getElementById("compare-summary");
  if (!wrap) return;

  const a1 = animesOf(allAnimes, p1);
  const a2 = animesOf(allAnimes, p2);
  const common = commonAnimes(allAnimes, p1, p2);
  const only1 = a1.length - common.length;
  const only2 = a2.length - common.length;
  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);

  wrap.innerHTML = `
    <div class="compare-summary-grid">
      <article class="compare-summary-card is-shared">
        <div class="compare-summary-card-inner">
          <span class="compare-summary-icon">◉</span>
          <div class="compare-summary-copy">
            <strong class="compare-summary-value">${common.length}</strong>
            <span class="compare-summary-note">itens compartilhados</span>
          </div>
          <span class="compare-summary-label">Total em comum</span>
        </div>
      </article>

      <article class="compare-summary-card" style="--summary-accent:${c1}">
        <div class="compare-summary-card-inner">
          <span class="compare-summary-icon">◎</span>
          <div class="compare-summary-copy">
            <strong class="compare-summary-value">${only1}</strong>
            <span class="compare-summary-note">itens exclusivos</span>
          </div>
          <span class="compare-summary-label">Só ${escapeHTML(p1)}</span>
        </div>
      </article>

      <article class="compare-summary-card" style="--summary-accent:${c2}">
        <div class="compare-summary-card-inner">
          <span class="compare-summary-icon">☆</span>
          <div class="compare-summary-copy">
            <strong class="compare-summary-value">${only2}</strong>
            <span class="compare-summary-note">${only2 === 1 ? "item exclusivo" : "itens exclusivos"}</span>
          </div>
          <span class="compare-summary-label">Só ${escapeHTML(p2)}</span>
        </div>
      </article>

      <article class="compare-summary-card is-total">
        <div class="compare-summary-card-inner">
          <span class="compare-summary-icon">▱</span>
          <div class="compare-summary-copy">
            <strong class="compare-summary-value">${only1 + common.length + only2}</strong>
            <span class="compare-summary-note">soma dos conjuntos</span>
          </div>
          <span class="compare-summary-label">Total único</span>
        </div>
      </article>
    </div>
  `;
}

function renderAffinityPanel(p1, p2) {
  const wrap = document.getElementById("venn4-container");
  if (!wrap) return;

  const shared = commonAnimes(allAnimes, p1, p2);
  if (!shared.length) {
    wrap.innerHTML = '<div class="empty-state"><p>Sem base suficiente para comparar esse par.</p></div>';
    return;
  }

  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);
  const avg1 = averageScoreForPerson(shared, p1);
  const avg2 = averageScoreForPerson(shared, p2);

  const scored = shared
    .map((anime) => {
      const n1 = getPersonNota(anime, p1);
      const n2 = getPersonNota(anime, p2);
      const diff = n1 !== null && n2 !== null ? Math.abs(n1 - n2) : null;
      return { anime, n1, n2, diff, avg: ((Number(n1) || 0) + (Number(n2) || 0)) / 2 };
    })
    .filter((item) => item.diff !== null);

  const strongestAgreement = [...scored].sort((a, b) => a.diff - b.diff || b.avg - a.avg)[0];
  const strongestDisagreement = [...scored].sort((a, b) => b.diff - a.diff || b.avg - a.avg)[0];

  const avgDiff = scored.reduce((sum, item) => sum + item.diff, 0) / Math.max(scored.length, 1);
  const exactMatches = scored.filter((item) => item.diff === 0).length;
  const closeMatches = scored.filter((item) => item.diff > 0 && item.diff <= 0.5).length;
  const oneStarDiff = scored.filter((item) => item.diff > 0.5 && item.diff <= 1.5).length;
  const hotTakes = scored.filter((item) => item.diff > 1.5).length;
  const compatibility = Math.max(0, Math.round(100 - avgDiff * 22));

  const commonGenreCounts = Object.entries(countGenres(shared))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const stricter = avg1 < avg2 ? p1 : p2;
  const softer = stricter === p1 ? p2 : p1;

  wrap.innerHTML = `
    <div class="compare-affinity-shell">
      <section class="compare-affinity-hero">
        <div class="compare-affinity-score">
          <div class="compare-affinity-match-card">
            <span class="compare-side-kpi-label">Compatibilidade</span>
            <strong class="compare-affinity-score-value">${compatibility}<small>%</small></strong>
            <div class="compare-affinity-meter">
              <span class="compare-affinity-meter-fill" style="width:${compatibility}%"></span>
            </div>
            <span class="compare-side-kpi-note"><i>✧</i> Match forte</span>
            <p>Alto nível de compatibilidade entre as notas analisadas.</p>
          </div>
        </div>

        <div class="compare-affinity-strip">
          <article class="compare-affinity-mini-card" style="--mini-accent:${c1}">
            <span class="compare-affinity-mini-icon">♚</span>
            <strong>${formatCompactScore(avg1)}</strong>
            <span class="compare-side-kpi-note">média das notas em comum</span>
          </article>
          <article class="compare-affinity-mini-card" style="--mini-accent:${c2}">
            <span class="compare-affinity-mini-icon">▤</span>
            <strong>${formatCompactScore(avg2)}</strong>
            <span class="compare-side-kpi-note">média dos títulos em comum</span>
          </article>
          <article class="compare-affinity-mini-card is-neutral">
            <span class="compare-affinity-mini-icon">⌖</span>
            <strong>${avgDiff.toFixed(2)}</strong>
            <span class="compare-side-kpi-note">distância entre as notas</span>
          </article>
        </div>
      </section>

      <section class="compare-affinity-bands">
        <article class="compare-affinity-band is-match">
          <span class="compare-affinity-band-icon">✓</span>
          <div class="compare-affinity-band-row">
            <strong>${exactMatches}</strong>
            <span class="compare-affinity-band-label">Notas iguais</span>
          </div>
        </article>
        <article class="compare-affinity-band is-close">
          <span class="compare-affinity-band-icon">∿</span>
          <div class="compare-affinity-band-row">
            <strong>${closeMatches}</strong>
            <span class="compare-affinity-band-label">Quase iguais</span>
          </div>
        </article>
        <article class="compare-affinity-band is-mid">
          <span class="compare-affinity-band-icon">☆</span>
          <div class="compare-affinity-band-row">
            <strong>${oneStarDiff}</strong>
            <span class="compare-affinity-band-label">Diferença de 1 estrela</span>
          </div>
        </article>
        <article class="compare-affinity-band is-hot">
          <span class="compare-affinity-band-icon">✦</span>
          <div class="compare-affinity-band-row">
            <strong>${hotTakes}</strong>
            <span class="compare-affinity-band-label">Notas opostas</span>
          </div>
        </article>
      </section>

      <div class="compare-affinity-grid">
        <article class="compare-affinity-panel">
          <span class="compare-side-block-title">Mai em comum</span>
          <strong class="compare-affinity-title">${escapeHTML(
            strongestAgreement ? shortText(strongestAgreement.anime.name, 32) : "Sem registro"
          )}</strong>
          <p>${escapeHTML(
            strongestAgreement
              ? `Pontuação ${formatCompactScore(strongestAgreement.n1)} • ${p2} ${formatCompactScore(strongestAgreement.n2)}`
              : "Ainda não existe um empate forte entre os dois."
          )}</p>
        </article>

        <article class="compare-affinity-panel">
          <span class="compare-side-block-title">Maior divergência</span>
          <strong class="compare-affinity-title">${escapeHTML(
            strongestDisagreement ? shortText(strongestDisagreement.anime.name, 32) : "Sem registro"
          )}</strong>
          <p>${escapeHTML(
            strongestDisagreement
              ? `Pontuação ${formatCompactScore(strongestDisagreement.n1)} • ${p2} ${formatCompactScore(strongestDisagreement.n2)} • GAP ${strongestDisagreement.diff.toFixed(1)}`
              : "Sem contraste relevante por enquanto."
          )}</p>
        </article>

        <article class="compare-affinity-panel">
          <span class="compare-side-block-title">Gêneros em comum</span>
          <div class="compare-affinity-tags">
            ${
              commonGenreCounts.length
                ? commonGenreCounts
                    .map(
                      ([genre, count]) =>
                        `<span class="compare-affinity-tag">${escapeHTML(cleanGenreLabel(genre))}<small>${count}</small></span>`
                    )
                    .join("")
                : '<span class="compare-affinity-tag">Sem gênero dominante</span>'
            }
          </div>
        </article>

        <article class="compare-affinity-panel compare-gap-panel" style="--gap-a:${c1}; --gap-b:${c2}">
          <span class="compare-side-block-title">Destaque do gap</span>
          <div class="compare-gap-panel-body">
            <p class="compare-affinity-reading">
              ${escapeHTML(stricter)} tende a dar notas mais rigorosas nesse recorte, enquanto ${escapeHTML(
    softer
  )} costuma avaliar mais na média. A distância média entre eles aqui ficou em ${avgDiff.toFixed(2)}.
            </p>
            <div class="compare-gap-mini-chart" aria-hidden="true">
              <svg viewBox="0 0 190 92" focusable="false">
                <path class="is-first" d="M4 78 C 28 78, 34 22, 58 24 S 92 78, 116 58 S 140 20, 184 10" />
                <path class="is-second" d="M4 78 C 30 82, 46 60, 68 42 S 100 26, 118 62 S 146 84, 184 40" />
              </svg>
              <div class="compare-gap-legend">
                <span><i></i>${escapeHTML(p1)}</span>
                <span><i></i>${escapeHTML(p2)}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  `;
}

function renderVenn(p1, p2) {
  const wrap = document.getElementById("venn-container");
  if (!wrap) return;

  const a1 = animesOf(allAnimes, p1);
  const a2 = animesOf(allAnimes, p2);
  const common = commonAnimes(allAnimes, p1, p2);
  const only1 = a1.length - common.length;
  const only2 = a2.length - common.length;
  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);

  wrap.innerHTML = `
    <div class="compare-dual-venn">
      <div class="compare-venn-circle is-left" style="--venn-accent:${c1}">
        <strong>${only1}</strong>
        <span>Só ${escapeHTML(p1)}</span>
      </div>

      <div class="compare-venn-overlap">
        <strong>${common.length}</strong>
        <span>Em comum</span>
      </div>

      <div class="compare-venn-circle is-right" style="--venn-accent:${c2}">
        <strong>${only2}</strong>
        <span>Só ${escapeHTML(p2)}</span>
      </div>
    </div>
  `;
}

function renderRadar(p1, p2) {
  const canvas = document.getElementById("chartRadar");
  if (!canvas) return;

  const allTop = topGenres(allAnimes, 6).map(([genre]) => genre);
  const labels = allTop.map(cleanGenreLabel);

  function genreVector(person) {
    const mine = animesOf(allAnimes, person);
    const map = countGenres(mine);
    const total = mine.length || 1;
    return allTop.map((genre) => Math.round(((map[genre] || 0) / total) * 100));
  }

  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);

  if (radarChart) radarChart.destroy();

  radarChart = new Chart(canvas, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: p1,
          data: genreVector(p1),
          backgroundColor: hexToRgba(c1, 0.18),
          borderColor: c1,
          borderWidth: 2.5,
          pointBackgroundColor: c1,
          pointBorderColor: c1,
          pointRadius: 3,
        },
        {
          label: p2,
          data: genreVector(p2),
          backgroundColor: hexToRgba(c2, 0.16),
          borderColor: c2,
          borderWidth: 2.5,
          pointBackgroundColor: c2,
          pointBorderColor: c2,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#eef2ff",
            boxWidth: 28,
            boxHeight: 12,
            padding: 16,
          },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { display: false },
          angleLines: { color: "rgba(186, 194, 221, 0.16)" },
          grid: { color: "rgba(186, 194, 221, 0.16)" },
          pointLabels: {
            color: "#e8ecff",
            font: { size: 13, weight: 600 },
          },
        },
      },
    },
  });
}

function renderCommonTable(p1, p2) {
  const wrap = document.getElementById("common-table-wrap");
  if (!wrap) return;

  const common = commonAnimes(allAnimes, p1, p2).sort(
    (a, b) => (Number(b.nota) || 0) - (Number(a.nota) || 0)
  );

  if (!common.length) {
    wrap.innerHTML = `<div class="empty-state">Nenhum anime em comum entre ${escapeHTML(p1)} e ${escapeHTML(p2)}.</div>`;
    return;
  }

  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);

  wrap.innerHTML = `
    <div class="compare-table-wrap">
      <table class="compare-table">
        <colgroup>
          <col class="compare-col-anime" />
          <col class="compare-col-score" />
          <col class="compare-col-score" />
          <col class="compare-col-diff" />
        </colgroup>
        <thead>
          <tr>
            <th>Anime</th>
            <th style="color:${c1}">${escapeHTML(p1)}</th>
            <th style="color:${c2}">${escapeHTML(p2)}</th>
            <th>Diff</th>
          </tr>
        </thead>
        <tbody>
          ${common
            .map((anime) => {
              const n1 = getPersonNota(anime, p1);
              const n2 = getPersonNota(anime, p2);
              const diff = n1 !== null && n2 !== null ? Math.abs(n1 - n2) : 0;
              const isHot = diff >= 2;

              return `
                <tr class="${isHot ? "diff-highlight" : ""}">
                  <td>
                    <div class="compare-anime-cell">
                      <img src="${anime.image_url || "assets/nyx-icon.webp"}" alt="${escapeHTML(anime.name)}" />
                      <div>
                        <strong>${escapeHTML(shortText(anime.name, 44))}</strong>
                        <span>${escapeHTML((anime.genres || []).slice(0, 2).map(cleanGenreLabel).join(" • "))}</span>
                      </div>
                    </div>
                  </td>
                  <td class="compare-score-cell" style="color:${c1}">${n1 !== null ? Number(n1).toFixed(1) : "—"}</td>
                  <td class="compare-score-cell" style="color:${c2}">${n2 !== null ? Number(n2).toFixed(1) : "—"}</td>
                  <td class="compare-diff-cell">${diff.toFixed(1)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function averageScoreForPerson(shared, person) {
  const scores = shared
    .map((anime) => getPersonNota(anime, person))
    .filter((score) => score !== null)
    .map(Number);

  if (!scores.length) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function formatCompactScore(value) {
  return Number(value || 0).toFixed(2);
}
