// js/charts.js?v=modal-modal-perf-1 — gráficos gerais (charts.html)

import {
  PEOPLE,
  PERSON_COLORS,
  cleanGenreLabel,
  topGenres,
  countGenres,
  animesOf,
} from "./data.js?v=modal-modal-perf-1";
import { hexToRgba, shortText } from "./utils.js";

Chart.defaults.color = "#94a3b8";
Chart.defaults.font.family = "'Poppins', sans-serif";
Chart.defaults.font.size = 12;

const GRID = { color: "rgba(255,255,255,0.06)", drawBorder: false };

export function renderAllCharts(animes) {
  renderTopGenresChart(animes);
  renderGenreByPersonChart(animes);
  renderScatterChart(animes);
  renderVotesRankingChart(animes);
  renderVotesPieChart(animes);
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
          backgroundColor: "rgba(124,58,237,0.7)",
          borderColor: "#7c3aed",
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
        x: { grid: GRID, ticks: { stepSize: 1 } },
        y: { grid: { display: false } },
      },
      animation: { duration: 800, easing: "easeOutQuart" },
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
      backgroundColor: PERSON_COLORS[p] + "bb",
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
      plugins: { legend: { labels: { boxWidth: 12, padding: 16 } } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: GRID, ticks: { stepSize: 1 } },
      },
      animation: { duration: 900 },
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
          backgroundColor: "rgba(236,72,153,0.65)",
          borderColor: "#ec4899",
          borderWidth: 1,
          pointRadius: 7,
          pointHoverRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) =>
              ` ${c.raw.nome}  |  nota ${c.raw.x.toFixed(1)}  |  🌶️ ${c.raw.y.toFixed(1)}`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Nota média", color: "#94a3b8" },
          grid: GRID,
          min: 5,
          max: 10,
        },
        y: {
          title: { display: true, text: "Controvérsia 🌶️", color: "#94a3b8" },
          grid: GRID,
          min: 0,
        },
      },
      animation: { duration: 1000 },
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
          backgroundColor: top.map((a) =>
            a.nota >= 9
              ? "rgba(52,211,153,0.8)"
              : a.nota >= 7.5
                ? "rgba(245,158,11,0.8)"
                : "rgba(239,68,68,0.7)",
          ),
          borderWidth: 0,
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
        x: { grid: GRID, min: 5, max: 10, ticks: { stepSize: 0.5 } },
        y: { grid: { display: false } },
      },
      animation: { duration: 800 },
    },
  });
}

function renderVotesPieChart(animes) {
  const ctx = document.getElementById("chartVotesPie");
  if (!ctx) return;
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  animes.forEach((a) => {
    if (a.qtdVotos >= 1 && a.qtdVotos <= 4) counts[a.qtdVotos]++;
  });
  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["1 pessoa", "2 pessoas", "3 pessoas", "4 pessoas (todos)"],
      datasets: [
        {
          data: [counts[1], counts[2], counts[3], counts[4]],
          backgroundColor: [
            "rgba(124,58,237,0.8)",
            "rgba(236,72,153,0.8)",
            "rgba(52,211,153,0.8)",
            "rgba(6,182,212,0.8)",
          ],
          borderColor: "#0f0f1a",
          borderWidth: 3,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { padding: 16, boxWidth: 12 } },
      },
      animation: { duration: 900 },
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
