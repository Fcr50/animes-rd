// js/charts.js
import { cleanGenreLabel, topGenres, countGenres, animesOf, getPersonNota, getPersonColor } from "./data.js";
import { hexToRgba, shortText } from "./utils.js";

Chart.defaults.color = "#b8ae9d";
Chart.defaults.font.family = "'Baloo 2', 'Inter', sans-serif";
Chart.defaults.font.size = 12;

const GRID = { color: "rgba(255,255,255,0.07)", drawBorder: false };

const TOOLTIP = {
  backgroundColor: "rgba(14, 14, 18, 0.95)",
  borderColor: "rgba(196, 181, 253, 0.25)",
  borderWidth: 1,
  titleColor: "#c4b5fd",
  bodyColor: "#b8ae9d",
  padding: 10,
  cornerRadius: 8,
  displayColors: false,
};

function horizGrad(context, colorStart, colorEnd) {
  const { chartArea } = context.chart;
  if (!chartArea) return colorEnd;
  const grad = context.chart.ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
  grad.addColorStop(0, colorStart);
  grad.addColorStop(1, colorEnd);
  return grad;
}

export function renderAllCharts(animes, members) {
  const approved = animes.filter(a => a.status === "approved");
  renderTopGenresChart(approved);
  renderGenreByPersonChart(approved, members);
  renderScatterChart(approved);
  renderVotesRankingChart(approved);
  renderVotesPieChart(approved, members);
}

export function renderChartsStats(animes, members) {
  const el = document.getElementById("charts-stats");
  if (!el) return;
  const approved = animes.filter(a => a.status === "approved");
  const total = approved.length;
  const genres = new Set(approved.map((a) => a.main_genre).filter(Boolean)).size;
  const rated = approved.filter((a) => a.nota !== null);
  const avg = rated.length
    ? (rated.reduce((s, a) => s + Number(a.nota), 0) / rated.length).toFixed(1)
    : "—";
  
  // Visto por todos (dinâmico com base no tamanho do grupo)
  const topVoted = approved.filter((a) => a.qtdVotos >= members.length).length;

  const pills = [
    { val: total, desc: "animes no acervo", icon: "📺" },
    { val: genres, desc: "gêneros únicos", icon: "🎭" },
    { val: avg, desc: "nota média geral", icon: "⭐" },
    { val: topVoted, desc: "vistos por todos", icon: "👑" },
  ];
  el.innerHTML = pills
    .map(
      (p) =>
        `<div class="charts-stat-pill"><strong>${p.icon} ${p.val}</strong> <span>${p.desc}</span></div>`,
    )
    .join("");
}

function renderTopGenresChart(animes) {
  const ctx = document.getElementById("chartTopGenres");
  if (!ctx) return;
  const top = topGenres(animes, 12);
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: top.map(([g]) => cleanGenreLabel(g)),
      datasets: [
        {
          data: top.map(([, c]) => c),
          backgroundColor: (context) =>
            horizGrad(context, "rgba(196,181,253,0.45)", "rgba(196,181,253,0.95)"),
          borderWidth: 0,
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP },
      },
      scales: {
        x: { grid: GRID, ticks: { stepSize: 1 } },
        y: { grid: { display: false } },
      },
      animation: { duration: 900, easing: "easeOutQuart" },
    },
  });
}

function renderGenreByPersonChart(animes, members) {
  const ctx = document.getElementById("chartGenreByPerson");
  if (!ctx) return;
  const allGenres = topGenres(animes, 8).map(([g]) => g);
  const datasets = members.map((m) => {
    const map = countGenres(animesOf(animes, m.nickname));
    const color = m.color || "#ccc";
    return {
      label: m.nickname,
      data: allGenres.map((g) => map[g] || 0),
      backgroundColor: color + "99",
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4,
    };
  });
  new Chart(ctx, {
    type: "bar",
    data: { labels: allGenres.map(cleanGenreLabel), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { boxWidth: 10, padding: 14, usePointStyle: true, pointStyle: "circle" },
        },
        tooltip: { ...TOOLTIP, displayColors: true },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: GRID, ticks: { stepSize: 1 } },
      },
      animation: { duration: 900, easing: "easeOutQuart" },
    },
  });
}

function renderScatterChart(animes) {
  const ctx = document.getElementById("chartScatter");
  if (!ctx) return;
  const points = animes
    .filter((a) => a.nota !== null && a.controversia !== null)
    .map((a) => ({
      x: parseFloat(Number(a.nota).toFixed(2)),
      y: parseFloat(Number(a.controversia).toFixed(2)),
      nome: a.name,
    }));
  new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          data: points,
          backgroundColor: "rgba(249,168,212,0.55)",
          borderColor: "#f9a8d4",
          borderWidth: 1,
          pointRadius: 6,
          pointHoverRadius: 9,
          pointHoverBackgroundColor: "#ec4899",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP,
          callbacks: {
            title: (items) => items[0].raw.nome,
            label: (c) => `nota ${c.raw.x.toFixed(1)}  ·  🌶️ ${c.raw.y.toFixed(1)}`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Nota média", color: "#7b7165" },
          grid: GRID,
          min: 5,
          max: 10,
        },
        y: {
          title: { display: true, text: "Controvérsia 🌶️", color: "#7b7165" },
          grid: GRID,
          min: 0,
        },
      },
      animation: { duration: 1000, easing: "easeOutQuart" },
    },
  });
}

function renderVotesRankingChart(animes) {
  const ctx = document.getElementById("chartVotesRanking");
  if (!ctx) return;
  const top = [...animes]
    .filter((a) => a.nota !== null)
    .sort((a, b) => (Number(b.nota) || 0) - (Number(a.nota) || 0))
    .slice(0, 10);
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: top.map((a) => shortText(a.name, 22)),
      datasets: [
        {
          data: top.map((a) => parseFloat(Number(a.nota).toFixed(2))),
          backgroundColor: (context) => {
            const nota = context.raw;
            if (nota >= 9)
              return horizGrad(context, "rgba(52,211,153,0.3)", "rgba(52,211,153,0.9)");
            if (nota >= 7.5)
              return horizGrad(context, "rgba(251,191,36,0.3)", "rgba(251,191,36,0.9)");
            return horizGrad(context, "rgba(239,68,68,0.3)", "rgba(239,68,68,0.8)");
          },
          borderWidth: 0,
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { ...TOOLTIP },
      },
      scales: {
        x: { grid: GRID, min: 5, max: 10, ticks: { stepSize: 0.5 } },
        y: { grid: { display: false } },
      },
      animation: { duration: 900, easing: "easeOutQuart" },
    },
  });
}

function renderVotesPieChart(animes, members) {
  const ctx = document.getElementById("chartVotesPie");
  if (!ctx) return;
  
  const counts = {};
  // Inicializa counts para 1 até N membros
  for(let i=1; i<=members.length; i++) counts[i] = 0;

  animes.forEach((a) => {
    if (a.qtdVotos >= 1 && a.qtdVotos <= members.length) {
      counts[a.qtdVotos] = (counts[a.qtdVotos] || 0) + 1;
    }
  });

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(counts).map(c => c == members.length ? `${c} pessoas (todos)` : `${c} pessoa(s)`),
      datasets: [
        {
          data: Object.values(counts),
          backgroundColor: [
            "rgba(167,139,250,0.85)",
            "rgba(249,168,212,0.85)",
            "rgba(110,231,183,0.85)",
            "rgba(103,232,249,0.85)",
            "rgba(253,186,116,0.85)",
            "rgba(148,163,184,0.85)"
          ],
          borderColor: "#0f0f1a",
          borderWidth: 3,
          hoverOffset: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { padding: 14, boxWidth: 10, usePointStyle: true, pointStyle: "circle" },
        },
        tooltip: { ...TOOLTIP, displayColors: true },
      },
      animation: { duration: 900, easing: "easeOutQuart" },
    },
  });
}
