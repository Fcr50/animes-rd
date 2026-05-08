// js/profile.js
import { loadData, animesOf, avgNota, favoriteGenre, topGenres, exclusiveAnimes, formatNota, notaColor } from './data.js';
import { escapeHTML } from './utils.js';

async function init() {
  console.log("Iniciando Profile. URL atual:", window.location.href);
  
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  
  // Tenta pegar 'p' de qualquer lugar da URL
  const personNickname = urlParams.get('p') || hashParams.get('p');
  
  if (!personNickname) {
    console.error("DEBUG - Parâmetros Query:", window.location.search);
    console.error("DEBUG - Parâmetros Hash:", window.location.hash);
    alert(`Nenhum usuário selecionado.\nURL: ${window.location.href}`);
    window.location.href = "index.html";
    return;
  }

  try {
    const data = await loadData();
    const member = data.members.find(m => m.nickname === personNickname);
    
    if (!member) {
      alert("Membro não encontrado neste grupo.");
      return;
    }

    renderHeader(member);
    renderStats(data.animes, personNickname);
    renderTopAnimes(data.animes, personNickname);
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
    <div class="profile-avatar" style="background: ${color}2e; color: ${color}; border: 3px solid ${color}">
      ${member.nickname[0].toUpperCase()}
    </div>
    <h1 style="color: ${color}">${member.nickname}</h1>
    <p class="profile-role">${member.role === 'admin' ? '👑 Criador do Grupo' : 'Membro'}</p>
  `;
}

function renderStats(animes, person) {
  const watched = animesOf(animes, person);
  const average = avgNota(animes, person);
  const favGenre = favoriteGenre(animes, person);

  const stats = document.getElementById("profile-stats");
  stats.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Animes Assistidos</div>
      <div class="stat-value">${watched.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Média Pessoal</div>
      <div class="stat-value">${formatNota(average)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Gênero Favorito</div>
      <div class="stat-value" style="font-size: 18px;">${favGenre}</div>
    </div>
  `;
}

function renderTopAnimes(animes, person) {
  const top10 = animesOf(animes, person)
    .sort((a, b) => (b[`nota${person}`] || 0) - (a[`nota${person}`] || 0))
    .slice(0, 10);

  const container = document.getElementById("top-animes");
  if (!top10.length) {
    container.innerHTML = "<p>Nenhuma avaliação registrada.</p>";
    return;
  }

  container.innerHTML = top10.map((a, i) => `
    <div class="profile-list-item">
      <span class="rank">#${i + 1}</span>
      <span class="name">${escapeHTML(a.name)}</span>
      <span class="score ${notaColor(a[`nota${person}`])}">${formatNota(a[`nota${person}`])}</span>
    </div>
  `).join("");
}

function renderGenres(animes, person) {
  const genres = topGenres(animesOf(animes, person), 5);
  const container = document.getElementById("genre-chart");
  
  if (!genres.length) {
    container.innerHTML = "<p>Sem dados.</p>";
    return;
  }

  container.innerHTML = genres.map(([name, count]) => `
    <div class="genre-bar-wrap">
      <div class="genre-info">
        <span>${name}</span>
        <span>${count} animes</span>
      </div>
      <div class="genre-bar">
        <div class="genre-progress" style="width: ${(count / genres[0][1]) * 100}%"></div>
      </div>
    </div>
  `).join("");
}

function renderExclusives(animes, person) {
  const excl = exclusiveAnimes(animes, person);
  const container = document.getElementById("exclusive-list");
  
  if (!excl.length) {
    container.innerHTML = "<p style='color: var(--faint)'>Nenhum anime exclusivo.</p>";
    return;
  }

  container.innerHTML = excl.map(a => `
    <div class="anime-mini-card">
      <img src="https://cdn.myanimelist.net/images/anime/${a.mal_id % 20}/${a.mal_id}.jpg" onerror="this.src='assets/placeholder.png'">
      <div class="name">${escapeHTML(a.name)}</div>
    </div>
  `).join("");
}

// Escuta mudanças no hash para atualizar a página sem recarregar
window.addEventListener("hashchange", init);

init();
