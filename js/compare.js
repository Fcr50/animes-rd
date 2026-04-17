// js/compare.js — lógica de comparação, Venn e radar

import {
  PEOPLE, PERSON_COLORS, PERSON_LIGHTS,
  animesOf, commonAnimes, countGenres,
  topGenres, cleanGenreLabel, formatNota, notaColor
} from "./data.js";

Chart.defaults.color = "#94a3b8";
Chart.defaults.font.family = "'Poppins', sans-serif";

let allAnimes = [];
let radarChart = null;

export function initCompare(animes) {
  allAnimes = animes;

  const s1 = document.getElementById("person1");
  const s2 = document.getElementById("person2");
  if (!s1 || !s2) return;

  PEOPLE.forEach((p, i) => {
    s1.innerHTML += `<option value="${p}" ${i === 0 ? "selected" : ""}>${p}</option>`;
    s2.innerHTML += `<option value="${p}" ${i === 1 ? "selected" : ""}>${p}</option>`;
  });

  s1.addEventListener("change", renderCompare);
  s2.addEventListener("change", renderCompare);

  renderVenn4();
  renderCompare();
}

function renderCompare() {
  const p1 = document.getElementById("person1").value;
  const p2 = document.getElementById("person2").value;

  renderVenn(p1, p2);
  renderRadar(p1, p2);
  renderCommonTable(p1, p2);
}

function renderVenn4() {
  const wrap = document.getElementById("venn4-container");
  if (!wrap) return;

  const members = ["Rafael", "Fernando", "Dudu", "Hacksuya"];
  const initials = { Rafael: "R", Fernando: "F", Dudu: "D", Hacksuya: "H" };

  // Conta cada subset não-vazio (2^4 - 1 = 15 regiões possíveis)
  const subsetCounts = new Map();
  for (const a of allAnimes) {
    const key = members.filter(m => a.quemAssistiu.includes(m)).join("+");
    if (!key) continue;
    subsetCounts.set(key, (subsetCounts.get(key) || 0) + 1);
  }

  const totals = {};
  members.forEach(m => totals[m] = animesOf(allAnimes, m).length);

  // 4 elipses sobrepostas (layout clássico de Venn-4 com rotação ±45°/±135°)
  const ellipses = [
    { person: "Rafael",   cx: 170, cy: 200, rx: 135, ry: 70, rot: -50 },
    { person: "Fernando", cx: 200, cy: 170, rx: 135, ry: 70, rot: -10 },
    { person: "Dudu",     cx: 200, cy: 230, rx: 135, ry: 70, rot:  10 },
    { person: "Hacksuya", cx: 230, cy: 200, rx: 135, ry: 70, rot:  50 },
  ];

  const svgEllipses = ellipses.map(e => {
    const color = PERSON_COLORS[e.person];
    return `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}"
      transform="rotate(${e.rot} ${e.cx} ${e.cy})"
      fill="${color}26" stroke="${color}" stroke-width="2"/>`;
  }).join("");

  // Legenda de intersecções, ordenada por tamanho do subset depois por contagem
  const intersections = [...subsetCounts.entries()]
    .map(([key, count]) => ({ key, count, size: key.split("+").length }))
    .sort((a, b) => b.size - a.size || b.count - a.count);

  const rowsHtml = intersections.map(({ key, count }) => {
    const parts = key.split("+");
    const badges = parts.map(p =>
      `<span class="badge badge-${p.toLowerCase()}">${initials[p]}</span>`
    ).join(" ");
    const label = parts.length === 4 ? "todos" :
                  parts.length === 1 ? `só ${parts[0]}` :
                  parts.join(" ∩ ");
    return `
      <li style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="display:flex;align-items:center;gap:8px">${badges}<span style="color:var(--muted);font-size:12px">${label}</span></span>
        <span style="font-weight:600">${count}</span>
      </li>
    `;
  }).join("");

  const legendHtml = members.map(m => {
    const light = PERSON_LIGHTS[m];
    return `<span style="color:${light}">● ${m}: ${totals[m]}</span>`;
  }).join("");

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center">
      <div style="display:flex;flex-direction:column;align-items:center">
        <svg viewBox="0 0 400 400" style="width:100%;max-width:380px" xmlns="http://www.w3.org/2000/svg">
          <defs><style>ellipse{mix-blend-mode:screen}</style></defs>
          ${svgEllipses}
        </svg>
        <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:8px;font-size:12px;color:var(--muted);justify-content:center">
          ${legendHtml}
        </div>
      </div>
      <div>
        <div style="font-size:12px;color:var(--faint);margin-bottom:8px">Animes por grupo (${intersections.length} combinações)</div>
        <ul style="list-style:none;padding:0;margin:0;max-height:340px;overflow-y:auto">
          ${rowsHtml || '<li style="color:var(--faint)">Sem dados</li>'}
        </ul>
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

  const c1 = PERSON_COLORS[p1];
  const c2 = PERSON_COLORS[p2];
  const l1 = PERSON_LIGHTS[p1];
  const l2 = PERSON_LIGHTS[p2];

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:0;padding:8px 0">
      <div style="
        width:130px;height:130px;border-radius:50%;
        background:${c1}33;border:2px solid ${c1};
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        margin-right:-32px;z-index:1;
      ">
        <span style="font-size:30px;font-weight:700;color:${l1}">${only1}</span>
        <span style="font-size:11px;color:${l1};margin-top:2px">só ${p1}</span>
      </div>
      <div style="
        width:110px;height:110px;border-radius:50%;
        background:rgba(160,80,200,0.35);border:2px solid #a855f7;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        z-index:2;
      ">
        <span style="font-size:26px;font-weight:700;color:#e9d5ff">${common.length}</span>
        <span style="font-size:10px;color:#c4b5fd;margin-top:2px">em comum</span>
      </div>
      <div style="
        width:130px;height:130px;border-radius:50%;
        background:${c2}33;border:2px solid ${c2};
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        margin-left:-32px;z-index:1;
      ">
        <span style="font-size:30px;font-weight:700;color:${l2}">${only2}</span>
        <span style="font-size:11px;color:${l2};margin-top:2px">só ${p2}</span>
      </div>
    </div>
    <p style="text-align:center;color:var(--faint);font-size:12px;margin-top:4px">
      ${p1}: ${a1.length} animes &nbsp;·&nbsp; ${p2}: ${a2.length} animes
    </p>
  `;
}

function renderRadar(p1, p2) {
  const ctx = document.getElementById("chartRadar");
  if (!ctx) return;

  const allTop = topGenres(allAnimes, 8).map(([g]) => g);
  const labels = allTop.map(cleanGenreLabel);

  function genreVec(person) {
    const mine = animesOf(allAnimes, person);
    const map = countGenres(mine);
    const total = mine.length || 1;
    return allTop.map((g) => Math.round(((map[g] || 0) / total) * 100));
  }

  const data1 = genreVec(p1);
  const data2 = genreVec(p2);

  const c1 = PERSON_COLORS[p1];
  const c2 = PERSON_COLORS[p2];

  if (radarChart) radarChart.destroy();

  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: p1,
          data: data1,
          backgroundColor: c1 + "33",
          borderColor: c1,
          borderWidth: 2,
          pointBackgroundColor: c1,
          pointRadius: 4,
        },
        {
          label: p2,
          data: data2,
          backgroundColor: c2 + "33",
          borderColor: c2,
          borderWidth: 2,
          pointBackgroundColor: c2,
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { boxWidth: 12, padding: 16 } },
        tooltip: {
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${c.raw}%`,
          },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { display: false },
          grid: { color: "rgba(255,255,255,0.08)" },
          angleLines: { color: "rgba(255,255,255,0.06)" },
          pointLabels: { font: { size: 11 }, color: "#94a3b8" },
        },
      },
      animation: { duration: 700 },
    },
  });
}

function renderCommonTable(p1, p2) {
  const wrap = document.getElementById("common-table-wrap");
  if (!wrap) return;

  const common = commonAnimes(allAnimes, p1, p2)
    .sort((a, b) => (b.nota || 0) - (a.nota || 0));

  if (!common.length) {
    wrap.innerHTML = `<div class="empty-state"><p>Nenhum anime em comum entre ${p1} e ${p2}.</p></div>`;
    return;
  }

  function pNota(a, person) {
    if (person === "Rafael") return a.notaRafael;
    if (person === "Fernando") return a.notaFernando;
    if (person === "Dudu") return a.notaDudu;
    if (person === "Hacksuya") return a.notaHacksuya;
    return null;
  }

  const c1 = PERSON_LIGHTS[p1];
  const c2 = PERSON_LIGHTS[p2];

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Anime</th>
            <th style="color:${c1}">${p1}</th>
            <th style="color:${c2}">${p2}</th>
            <th>Diferença</th>
          </tr>
        </thead>
        <tbody>
          ${common.map((a) => {
            const n1 = pNota(a, p1);
            const n2 = pNota(a, p2);
            const diff = (n1 !== null && n2 !== null) ? Math.abs(n1 - n2) : null;
            const diffStr = diff !== null ? diff.toFixed(1) : "—";
            const rowClass = diff !== null && diff >= 2 ? ' class="diff-highlight"' : "";
            return `
              <tr${rowClass}>
                <td>${a.nome}</td>
                <td style="color:${c1};font-weight:600">${n1 !== null ? n1.toFixed(1) : "—"}</td>
                <td style="color:${c2};font-weight:600">${n2 !== null ? n2.toFixed(1) : "—"}</td>
                <td>${diff !== null && diff >= 2 ? "⚡ " : ""}${diffStr}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}
