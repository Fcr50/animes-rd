// js/charts.js
import { topGenres, notaColor, formatNota } from "./data.js";

export function initCharts(animes) {
  const genreContainer = document.getElementById("genre-stats");
  const topAnimesContainer = document.getElementById("top-animes-stats");

  if (!animes || animes.length === 0) {
    if (genreContainer) genreContainer.innerHTML = '<p class="empty-msg">Nenhum dado de gênero disponível.</p>';
    if (topAnimesContainer) topAnimesContainer.innerHTML = '<p class="empty-msg">O acervo está vazio.</p>';
    return;
  }

  renderGenreStats(animes);
  renderTopAnimes(animes);
}

function renderGenreStats(animes) {
  const genres = topGenres(animes, 10);
  const container = document.getElementById("genre-stats");
  if (!container) return;

  container.innerHTML = genres.map(([name, count]) => `
    <div class="stat-row">
      <div class="stat-info">
        <span class="stat-name">${name}</span>
        <span class="stat-count">${count} animes</span>
      </div>
      <div class="stat-bar-bg">
        <div class="stat-bar-fill" style="width: ${(count / genres[0][1]) * 100}%"></div>
      </div>
    </div>
  `).join("");
}

function renderTopAnimes(animes) {
  const sorted = [...animes]
    .filter(a => a.nota !== null)
    .sort((a, b) => b.notaSort - a.notaSort)
    .slice(0, 10);
    
  const container = document.getElementById("top-animes-stats");
  if (!container) return;

  if (sorted.length === 0) {
    container.innerHTML = '<p class="empty-msg">Nenhum anime com nota no grupo.</p>';
    return;
  }

  container.innerHTML = sorted.map((a, i) => `
    <div class="ranking-item">
      <span class="rank-pos">#${i + 1}</span>
      <span class="rank-name">${a.name}</span>
      <span class="rank-val ${notaColor(a.notaSort)}">${formatNota(a.notaSort)}</span>
    </div>
  `).join("");
}
