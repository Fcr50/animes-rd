// js/compare.js
import { animesOf, commonAnimes, countGenres, topGenres, cleanGenreLabel, getPersonNota, getPersonColor } from "./data.js";
import { hexToRgba, shortText } from "./utils.js";

Chart.defaults.color = "#94a3b8";
Chart.defaults.font.family = "'Poppins', sans-serif";

let allAnimes = [];
let radarChart = null;
let currentMembers = [];

export function initCompare(animes, members) {
  allAnimes = animes;
  currentMembers = members;

  const s1 = document.getElementById("person1");
  const s2 = document.getElementById("person2");
  if (!s1 || !s2) return;

  // Popula os seletores dinamicamente
  s1.innerHTML = "";
  s2.innerHTML = "";
  members.forEach((m, i) => {
    s1.innerHTML += `<option value="${m.nickname}" ${i === 0 ? "selected" : ""}>${m.nickname}</option>`;
    s2.innerHTML += `<option value="${m.nickname}" ${i === 1 ? "selected" : ""}>${m.nickname}</option>`;
  });

  s1.addEventListener("change", renderCompare);
  s2.addEventListener("change", renderCompare);

  renderVennAll();
  renderCompare();
}

function renderCompare() {
  const p1 = document.getElementById("person1").value;
  const p2 = document.getElementById("person2").value;

  renderVenn(p1, p2);
  renderRadar(p1, p2);
  renderCommonTable(p1, p2);
}

function renderVennAll() {
  const wrap = document.getElementById("venn4-container");
  if (!wrap) return;

  if (!allAnimes || allAnimes.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><p>O acervo do grupo está vazio.</p></div>';
    return;
  }

  const subsetCounts = new Map();
  for (const a of allAnimes) {
    const key = currentMembers
      .filter((m) => a.quemAssistiu.includes(m.nickname))
      .map(m => m.nickname)
      .join("+");
    if (!key) continue;
    subsetCounts.set(key, (subsetCounts.get(key) || 0) + 1);
  }

  const totals = {};
  currentMembers.forEach((m) => (totals[m.nickname] = animesOf(allAnimes, m.nickname).length));

  const intersections = [...subsetCounts.entries()]
    .map(([key, count]) => ({ key, count, size: key.split("+").length }))
    .sort((a, b) => b.size - a.size || b.count - a.count);

  const rowsHtml = intersections
    .map(({ key, count }) => {
      const parts = key.split("+");
      const badges = parts
        .map((p) => {
          const m = currentMembers.find(member => member.nickname === p);
          const color = m?.color || "#888";
          return `<span class="nav-avatar" style="background: ${color}2e; color: ${color}; width: 20px; height: 20px; font-size: 10px; margin-right: 2px;">${p[0].toUpperCase()}</span>`;
        })
        .join(" ");
      const label =
        parts.length === currentMembers.length
          ? "todos"
          : parts.length === 1
            ? `só ${parts[0]}`
            : parts.join(" ∩ ");
      return `
      <li style="display:flex;align-items:center;justify-content:space-between;gap:18px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="display:flex;align-items:center;gap:8px">${badges}<span style="color:var(--muted);font-size:12px">${label}</span></span>
        <span style="font-weight:600;min-width:28px;text-align:right">${count}</span>
      </li>
    `;
    })
    .join("");

  const legendHtml = currentMembers
    .map((m) => {
      const color = m.color || "#888";
      return `<span style="color:${color}">● ${m.nickname}: ${totals[m.nickname]}</span>`;
    })
    .join("");

  wrap.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center">
      <div style="font-size:12px;color:var(--faint);margin-bottom:8px">Animes por grupo (${intersections.length} combinações)</div>
      <ul class="compare-combo-list" style="list-style:none;padding:0 22px 0 0;margin:0;max-height:340px;overflow-y:auto; width: 100%;">
        ${rowsHtml || '<li style="color:var(--faint)">Sem dados</li>'}
      </ul>
      <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:16px;font-size:12px;color:var(--muted);justify-content:center">
          ${legendHtml}
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
    <div style="display:flex;align-items:center;justify-content:center;gap:0;padding:8px 0">
      <div style="width:130px;height:130px;border-radius:50%;background:${c1}33;border:2px solid ${c1};display:flex;flex-direction:column;align-items:center;justify-content:center;margin-right:-32px;z-index:1;">
        <span style="font-size:30px;font-weight:700;color:${c1}">${only1}</span>
        <span style="font-size:11px;color:${c1};margin-top:2px">só ${p1}</span>
      </div>
      <div style="width:110px;height:110px;border-radius:50%;background:rgba(160,80,200,0.35);border:2px solid #a855f7;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2;">
        <span style="font-size:26px;font-weight:700;color:#e9d5ff">${common.length}</span>
        <span style="font-size:10px;color:#c4b5fd;margin-top:2px">em comum</span>
      </div>
      <div style="width:130px;height:130px;border-radius:50%;background:${c2}33;border:2px solid ${c2};display:flex;flex-direction:column;align-items:center;justify-content:center;margin-left:-32px;z-index:1;">
        <span style="font-size:30px;font-weight:700;color:${c2}">${only2}</span>
        <span style="font-size:11px;color:${c2};margin-top:2px">só ${p2}</span>
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

  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);

  if (radarChart) radarChart.destroy();

  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: p1,
          data: data1,
          backgroundColor: hexToRgba(c1, 0.2),
          borderColor: c1,
          borderWidth: 2,
          pointBackgroundColor: c1,
          pointRadius: 4,
        },
        {
          label: p2,
          data: data2,
          backgroundColor: hexToRgba(c2, 0.2),
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
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.raw}%` } },
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

  // Filtra animes em comum usando a lógica do data.js
  const common = commonAnimes(allAnimes, p1, p2).sort((a, b) => (Number(b.nota) || 0) - (Number(a.nota) || 0));

  if (!common.length) {
    wrap.innerHTML = `<div class="empty-state"><p>Nenhum anime em comum entre ${p1} e ${p2}.</p></div>`;
    return;
  }

  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);

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
              const n1 = getPersonNota(a, p1);
              const n2 = getPersonNota(a, p2);
              const diff = (n1 !== null && n2 !== null) ? Math.abs(n1 - n2) : null;
              const diffStr = diff !== null ? diff.toFixed(1) : "—";
              const rowClass = (diff !== null && diff >= 2) ? ' class="diff-highlight"' : "";
              
              return `
              <tr${rowClass}>
                <td><strong>${escapeHTML(a.name)}</strong></td>
                <td style="color:${c1}; font-weight:700">${n1 !== null ? Number(n1).toFixed(1) : "—"}</td>
                <td style="color:${c2}; font-weight:700">${n2 !== null ? Number(n2).toFixed(1) : "—"}</td>
                <td style="font-weight:700">${diff !== null && diff >= 2 ? "⚡ " : ""}${diffStr}</td>
              </tr>`;
            }).join("")}
        </tbody>
      </table>
    </div>
  `;
}
