// js/compare.js
import { animesOf, commonAnimes, countGenres, topGenres, cleanGenreLabel, getPersonNota, getPersonColor } from "./data.js";
import { hexToRgba, escapeHTML, shortText } from "./utils.js";

Chart.defaults.color = "#94a3b8";
Chart.defaults.font.family = "'Poppins', sans-serif";

let allAnimes = [];
let radarChart = null;
let currentMembers = [];

export function initCompare(animes, members) {
  allAnimes = animes || [];
  currentMembers = members || [];

  const s1 = document.getElementById("person1");
  const s2 = document.getElementById("person2");
  if (!s1 || !s2) return;

  s1.innerHTML = "";
  s2.innerHTML = "";
  currentMembers.forEach((m, i) => {
    const opt1 = document.createElement("option");
    opt1.value = m.nickname;
    opt1.textContent = m.nickname;
    if (i === 0) opt1.selected = true;
    s1.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = m.nickname;
    opt2.textContent = m.nickname;
    if (i === 1 || (currentMembers.length === 1 && i === 0)) opt2.selected = true;
    s2.appendChild(opt2);
  });

  const handleChange = () => renderCompare();
  s1.onchange = handleChange;
  s2.onchange = handleChange;

  renderVennAll();
  renderCompare();
}

function renderCompare() {
  const p1 = document.getElementById("person1")?.value;
  const p2 = document.getElementById("person2")?.value;

  if (!p1 || !p2) return;

  renderVenn(p1, p2);
  renderRadar(p1, p2);
  renderCommonTable(p1, p2);
}

function renderVennAll() {
  const wrap = document.getElementById("venn4-container");
  if (!wrap) return;

  if (!allAnimes.length) {
    wrap.innerHTML = '<div class="empty-state"><p>O acervo do grupo está vazio.</p></div>';
    return;
  }

  const subsetCounts = new Map();
  for (const a of allAnimes) {
    const watchers = currentMembers
      .filter((m) => (a.quemAssistiu || []).includes(m.nickname))
      .map(m => m.nickname)
      .sort();
    
    if (watchers.length === 0) continue;
    const key = watchers.join("+");
    subsetCounts.set(key, (subsetCounts.get(key) || 0) + 1);
  }

  const totals = {};
  currentMembers.forEach((m) => (totals[m.nickname] = animesOf(allAnimes, m.nickname).length));

  const intersections = [...subsetCounts.entries()]
    .map(([key, count]) => ({ key, count, size: key.split("+").length }))
    .sort((a, b) => b.size - a.size || b.count - a.count);

  const rowsHtml = intersections.map(({ key, count }) => {
      const parts = key.split("+");
      const badges = parts.map((p) => {
          const m = currentMembers.find(member => member.nickname === p);
          const color = m?.color || "#888";
          return `<span class="nav-avatar" style="background: ${color}2e; color: ${color}; width: 20px; height: 20px; font-size: 10px; margin-right: 2px;">${p[0].toUpperCase()}</span>`;
        }).join(" ");
      return `
      <li style="display:flex;align-items:center;justify-content:space-between;gap:18px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="display:flex;align-items:center;gap:8px">${badges}<span style="color:var(--muted);font-size:12px">${parts.join(" ∩ ")}</span></span>
        <span style="font-weight:600;min-width:28px;text-align:right">${count}</span>
      </li>`;
    }).join("");

  wrap.innerHTML = `<ul class="compare-combo-list" style="list-style:none;padding:0;margin:0;max-height:340px;overflow-y:auto; width: 100%;">${rowsHtml || '<li style="color:var(--faint)">Sem dados</li>'}</ul>`;
}

function renderVenn(p1, p2) {
  const wrap = document.getElementById("venn-container");
  if (!wrap) return;

  const a1 = animesOf(allAnimes, p1);
  const a2 = animesOf(allAnimes, p2);
  const common = commonAnimes(allAnimes, p1, p2);

  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:0;padding:8px 0">
      <div style="width:120px;height:120px;border-radius:50%;background:${c1}22;border:2px solid ${c1};display:flex;flex-direction:column;align-items:center;justify-content:center;margin-right:-30px;z-index:1;">
        <span style="font-size:24px;font-weight:700;color:${c1}">${a1.length - common.length}</span>
      </div>
      <div style="width:100px;height:100px;border-radius:50%;background:rgba(167,139,250,0.2);border:2px solid #a78bfa;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2;">
        <span style="font-size:22px;font-weight:700;color:#ddd">${common.length}</span>
      </div>
      <div style="width:120px;height:120px;border-radius:50%;background:${c2}22;border:2px solid ${c2};display:flex;flex-direction:column;align-items:center;justify-content:center;margin-left:-30px;z-index:1;">
        <span style="font-size:24px;font-weight:700;color:${c2}">${a2.length - common.length}</span>
      </div>
    </div>`;
}

function renderRadar(p1, p2) {
  const canvas = document.getElementById("chartRadar");
  if (!canvas) return;

  const allTop = topGenres(allAnimes, 8).map(([g]) => g);
  const labels = allTop.map(cleanGenreLabel);

  function genreVec(person) {
    const mine = animesOf(allAnimes, person);
    const map = countGenres(mine);
    const total = mine.length || 1;
    return allTop.map((g) => Math.round(((map[g] || 0) / total) * 100));
  }

  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);
  if (radarChart) radarChart.destroy();

  radarChart = new Chart(canvas, {
    type: "radar",
    data: {
      labels,
      datasets: [
        { label: p1, data: genreVec(p1), backgroundColor: hexToRgba(c1, 0.2), borderColor: c1, borderWidth: 2 },
        { label: p2, data: genreVec(p2), backgroundColor: hexToRgba(c2, 0.2), borderColor: c2, borderWidth: 2 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { r: { beginAtZero: true, max: 100, ticks: { display: false } } }
    }
  });
}

function renderCommonTable(p1, p2) {
  const wrap = document.getElementById("common-table-wrap");
  if (!wrap) return;

  const common = commonAnimes(allAnimes, p1, p2).sort((a, b) => (Number(b.nota) || 0) - (Number(a.nota) || 0));

  if (!common.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding: 40px; text-align: center; color: var(--faint);">Nenhum anime em comum entre ${p1} e ${p2}.</div>`;
    return;
  }

  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);

  wrap.innerHTML = `
    <div class="table-wrap">
      <table style="width:100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid var(--border);">
            <th style="text-align:left; padding:12px;">Anime</th>
            <th style="color:${c1}">${p1}</th>
            <th style="color:${c2}">${p2}</th>
            <th>Diff</th>
          </tr>
        </thead>
        <tbody>
          ${common.map((a) => {
            const n1 = getPersonNota(a, p1);
            const n2 = getPersonNota(a, p2);
            const diff = (n1 !== null && n2 !== null) ? Math.abs(n1 - n2) : 0;
            return `
              <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding:12px;"><strong>${escapeHTML(a.name)}</strong></td>
                <td style="text-align:center; font-weight:bold; color:${c1}">${n1 !== null ? Number(n1).toFixed(1) : "—"}</td>
                <td style="text-align:center; font-weight:bold; color:${c2}">${n2 !== null ? Number(n2).toFixed(1) : "—"}</td>
                <td style="text-align:center; opacity:0.8;">${diff.toFixed(1)}</td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}
