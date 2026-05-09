// js/profile.js
import { loadData, animesOf, avgNota, favoriteGenre, topGenres, exclusiveAnimes, formatNota, notaColor, favoriteAnime, mostControversial } from './data.js';
import { escapeHTML, shortText } from './utils.js';

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const personNickname = urlParams.get('p') || hashParams.get('p');
  
  if (!personNickname) {
    window.location.href = "index.html";
    return;
  }

  try {
    const data = await loadData();
    const member = data.members.find(m => m.nickname === personNickname);
    
    if (!member) {
      alert("Membro não encontrado.");
      return;
    }

    renderHeader(member);
    renderHighlights(data.animes, personNickname, member.color);
    renderStats(data.animes, personNickname);
    renderTopAnimes(data.animes, personNickname, member.color);
    renderGenres(data.animes, personNickname);
    renderExclusives(data.animes, personNickname);

  } catch (err) {
    console.error("Erro ao carregar perfil:", err);
  }
}

function renderHeader(member) {
  const header = document.getElementById("profile-header");
  const color = member.color || "#8b5cf6";
  header.innerHTML = `
    <h1 style="color: ${color}; font-size: 38px; margin-bottom: 5px;">${member.nickname}</h1>
    <p class="profile-role" style="color: var(--faint); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; font-size: 12px;">
      ${member.role === 'admin' ? '👑 Criador do Grupo' : 'Membro do Grupo'}
    </p>
  `;
}

function renderHighlights(animes, person, color) {
  const best = favoriteAnime(animes, person);
  const hottest = mostControversial(animes, person);
  const favGenre = favoriteGenre(animes, person);
  const container = document.getElementById("profile-highlights");

  container.innerHTML = `
    <div class="stat-card highlight-card" style="border-top: 4px solid ${color}">
      <div class="stat-label">⭐ Melhor Avaliado</div>
      <div class="stat-value" style="font-size: 16px; margin-top: 10px;">${best ? shortText(best.name, 25) : '—'}</div>
      <div class="stat-sub" style="color:${color}">${best ? formatNota(best[`nota${person}`]) : ''}</div>
    </div>
    <div class="stat-card highlight-card" style="border-top: 4px solid var(--danger)">
      <div class="stat-label">🌶️ Mais Controverso</div>
      <div class="stat-value" style="font-size: 16px; margin-top: 10px;">${hottest ? shortText(hottest.name, 25) : '—'}</div>
      <div class="stat-sub" style="color:var(--danger)">Dif: ${hottest ? hottest.controversia.toFixed(1) : '0.0'}</div>
    </div>
    <div class="stat-card highlight-card" style="border-top: 4px solid var(--accent)">
      <div class="stat-label">🎭 Gênero Favorito</div>
      <div class="stat-value" style="font-size: 16px; margin-top: 10px;">${favGenre}</div>
    </div>
  `;
}

function renderStats(animes, person) {
  const watched = animesOf(animes, person);
  const average = avgNota(animes, person);

  const stats = document.getElementById("profile-stats");
  stats.innerHTML = `
    <div class="stat-card mini">
      <div class="stat-label">Assistidos</div>
      <div class="stat-value" style="font-size: 24px;">${watched.length}</div>
    </div>
    <div class="stat-card mini">
      <div class="stat-label">Média</div>
      <div class="stat-value" style="font-size: 24px;">${formatNota(average)}</div>
    </div>
  `;
}

function renderTopAnimes(animes, person, color) {
  const top10 = animesOf(animes, person)
    .filter(a => a[`nota${person}`] !== null)
    .sort((a, b) => (b[`nota${person}`] || 0) - (a[`nota${person}`] || 0))
    .slice(0, 10);

  const container = document.getElementById("top-animes");
  if (!top10.length) {
    container.innerHTML = "<p style='padding:20px; color:var(--faint)'>Nenhuma nota registrada.</p>";
    return;
  }

  container.innerHTML = `
    <div class="ranking-grid">
      ${top10.map((a, i) => `
        <div class="ranking-item">
          <div class="rank-number" style="color: ${color}">#${i + 1}</div>
          <div class="rank-info">
            <div class="rank-name">${escapeHTML(a.name)}</div>
            <div class="rank-genres">${(a.genres || []).slice(0, 2).join(", ")}</div>
          </div>
          <div class="rank-score ${notaColor(a[`nota${person}`])}">${formatNota(a[`nota${person}`])}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderGenres(animes, person) {
  const genres = topGenres(animesOf(animes, person), 6);
  const container = document.getElementById("genre-chart");
  
  if (!genres.length) {
    container.innerHTML = "<p style='color:var(--faint)'>Sem dados.</p>";
    return;
  }

  container.innerHTML = genres.map(([name, count]) => `
    <div class="genre-bar-row">
      <div class="genre-bar-info">
        <span>${name}</span>
        <small>${count} animes</small>
      </div>
      <div class="genre-bar-bg">
        <div class="genre-bar-fill" style="width: ${(count / genres[0][1]) * 100}%"></div>
      </div>
    </div>
  `).join("");
}

function renderExclusives(animes, person) {
  const excl = exclusiveAnimes(animes, person);
  const container = document.getElementById("exclusive-list");
  
  if (!excl.length) {
    container.innerHTML = "<p style='color: var(--faint); padding: 20px;'>Nenhum anime exclusivo.</p>";
    return;
  }

  container.innerHTML = excl.map(a => `
    <div class="exclusive-mini-card">
      <img src="${a.image_url}" onerror="this.src='assets/placeholder.png'">
      <div class="exclusive-info">
        <strong>${escapeHTML(a.name)}</strong>
        <span>Nota: ${formatNota(a[`nota${person}`])}</span>
      </div>
    </div>
  `).join("");
}

window.addEventListener("hashchange", () => window.location.reload());

init();
