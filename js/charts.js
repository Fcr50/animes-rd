// js/charts.js?v=charts-cute-1 — gráficos gerais (charts.html)

import {
  PEOPLE,
  PERSON_COLORS,
  cleanGenreLabel,
  topGenres,
  countGenres,
  animesOf,
} from "./data.js?v=desafios-soft-1";
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

export function renderAllCharts(animes) {
  renderTopGenresChart(animes);
  renderGenreByPersonChart(animes);
  renderScatterChart(animes);
  renderVotesRankingChart(animes);
  renderVotesPieChart(animes);
}

export function renderChartsStats(animes) {
  const el = document.getElementById("charts-stats");
  if (!el) return;
  const total = animes.length;
  const genres = new Set(animes.flatMap((a) => a.generos || [])).size;
  const rated = animes.filter((a) => a.nota !== null);
  const avg = rated.length
    ? (rated.reduce((s, a) => s + a.nota, 0) / rated.length).toFixed(1)
    : "—";
  const top5 = animes.filter((a) => a.qtdVotos === 5).length;
  const pills = [
    { val: total, desc: "animes no acervo", icon: "📺" },
    { val: genres, desc: "gêneros únicos", icon: "🎭" },
    { val: avg, desc: "nota média geral", icon: "⭐" },
    { val: top5, desc: "vistos por todos", icon: "👑" },
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

function renderGenreByPersonChart(animes) {
  const ctx = document.getElementById("chartGenreByPerson");
  if (!ctx) return;
  const allGenres = topGenres(animes, 8).map(([g]) => g);
  const datasets = PEOPLE.map((p) => {
    const map = countGenres(animesOf(animes, p));
    return {
      label: p,
      data: allGenres.map((g) => map[g] || 0),
      backgroundColor: PERSON_COLORS[p] + "99",
      borderColor: PERSON_COLORS[p],
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
      nome: a.nome,
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
    .sort((a, b) => (b.nota || 0) - (a.nota || 0))
    .slice(0, 10);
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: top.map((a) => shortText(a.nome, 22)),
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

function renderVotesPieChart(animes) {
  const ctx = document.getElementById("chartVotesPie");
  if (!ctx) return;
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  animes.forEach((a) => {
    if (a.qtdVotos >= 1 && a.qtdVotos <= 5) counts[a.qtdVotos]++;
  });
  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["1 pessoa", "2 pessoas", "3 pessoas", "4 pessoas", "5 pessoas (todos)"],
      datasets: [
        {
          data: [counts[1], counts[2], counts[3], counts[4], counts[5]],
          backgroundColor: [
            "rgba(167,139,250,0.85)",
            "rgba(249,168,212,0.85)",
            "rgba(110,231,183,0.85)",
            "rgba(103,232,249,0.85)",
            "rgba(253,186,116,0.85)",
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

export function renderPersonPieChart(canvasId, animes, person, color) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const mine = animesOf(animes, person);
  const map = countGenres(mine);
  const entries = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: entries.map(([g]) => cleanGenreLabel(g)),
      datasets: [
        {
          data: entries.map(([, c]) => c),
          backgroundColor: entries.map((_, i) => hexToRgba(color, Math.max(0.25, 1 - i * 0.1))),
          borderColor: "#1a1a2e",
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: { boxWidth: 10, padding: 10, font: { size: 11 } },
        },
      },
      animation: { duration: 800 },
    },
  });
}

export function renderPersonNotasChart(canvasId, animes, person, color) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  function pNota(a) {
    if (person === "Rafael") return a.notaRafael;
    if (person === "Fernando") return a.notaFernando;
    if (person === "Dudu") return a.notaDudu;
    if (person === "Hacksuya") return a.notaHacksuya;
    if (person === "Zana") return a.notaZana;
    return null;
  }
  const top = animesOf(animes, person)
    .filter((a) => pNota(a) !== null)
    .sort((a, b) => pNota(b) - pNota(a))
    .slice(0, 10);
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: top.map((a) => shortText(a.nome, 20)),
      datasets: [
        {
          data: top.map((a) => pNota(a)),
          backgroundColor: hexToRgba(color, 0.75),
          borderColor: color,
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: GRID, min: 5, max: 10 },
        y: { grid: { display: false } },
      },
      animation: { duration: 800, easing: "easeOutQuart" },
    },
  });
}
