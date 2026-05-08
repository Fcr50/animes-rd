// js/desafios.js
import { animesOf, avgNota, favoriteGenre, formatNota, loadData, missedAnimes, getPersonColor } from "./data.js";
import { escapeHTML, stripEmoji } from "./utils.js";
import { initBatalha } from "./batalha.js";

// ── Tabs ─────────────────────────────────────────────────────────────────────

document.getElementById("desafios-tabs")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".desafio-tab");
  if (!btn) return;
  document.querySelectorAll(".desafio-tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".desafio-panel").forEach((p) => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
});

// ── 🔮 Previsão de Nota ──────────────────────────────────────────────────────

const PREV_KEY = "desafios-previsoes-v1";

function getSavedPredictions() {
  try {
    return JSON.parse(localStorage.getItem(PREV_KEY)) || [];
  } catch {
    return [];
  }
}

function savePrediction(entry) {
  const list = getSavedPredictions().filter(
    (p) => !(p.person === entry.person && p.animeId === entry.animeId),
  );
  list.unshift(entry);
  try {
    localStorage.setItem(PREV_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {}
}

function renderPredictions(animes, members) {
  const list = getSavedPredictions();
  const container = document.getElementById("prev-history");
  if (!list.length || !container) {
    if(container) container.innerHTML = "";
    return;
  }

  const rows = list
    .map((p) => {
      const anime = animes.find((a) => a.id === p.animeId);
      const member = members.find(m => m.nickname === p.person);
      const color = member?.color || "#a78bfa";
      
      const realScore = anime ? anime[`nota${p.person}`] : null;
      const watched = realScore !== null && realScore !== undefined;
      const diff = watched ? (Number(realScore) - Number(p.predicted)).toFixed(1) : null;
      const diffLabel = diff
        ? `<span class="pdiff ${Number(diff) > 0 ? "pos" : Number(diff) < 0 ? "neg" : "zero"}">${Number(diff) > 0 ? "+" : ""}${diff}</span>`
        : "";

      return `
      <div class="prev-row">
        <div class="prev-row-info">
          <div class="prev-row-name">${escapeHTML(p.animeName)}</div>
          <div class="prev-row-person" style="color:${color}">${p.person}</div>
        </div>
        <div class="prev-row-scores">
          <div class="prev-score-block">
            <small>Previsão</small>
            <strong style="color:${color}">${p.predicted}</strong>
          </div>
          <div class="prev-arrow">→</div>
          <div class="prev-score-block">
            <small>Real</small>
            <strong class="${watched ? "" : "pending"}">${watched ? Number(realScore).toFixed(1) : "—"}</strong>
          </div>
          ${diffLabel}
        </div>
      </div>
    `;
    })
    .join("");

  container.innerHTML = `
    <div class="prev-history-header">
      <h3>Histórico de previsões</h3>
      <button class="desafio-btn secondary" id="prev-clear" style="font-size:11px;padding:6px 14px">Limpar</button>
    </div>
    <div class="prev-history-list">${rows}</div>
  `;

  document.getElementById("prev-clear")?.addEventListener("click", () => {
    localStorage.removeItem(PREV_KEY);
    renderPredictions(animes, members);
  });
}

function initPrevisao(data) {
  const personSel = document.getElementById("prev-person");
  const animeSel = document.getElementById("prev-anime");
  const slider = document.getElementById("prev-slider");
  const sliderVal = document.getElementById("prev-slider-val");

  if(!personSel) return;

  personSel.innerHTML = data.members.map((m) => `<option value="${m.nickname}">${m.nickname}</option>`).join("");

  slider?.addEventListener("input", () => {
    sliderVal.textContent = parseFloat(slider.value).toFixed(1);
  });

  function updateAnimes() {
    const person = personSel.value;
    const missed = missedAnimes(data.animes, person).sort((a, b) => a.name.localeCompare(b.name));
    animeSel.innerHTML = missed
      .map((a) => `<option value="${a.id}">${escapeHTML(a.name)}</option>`)
      .join("");
  }

  personSel.addEventListener("change", updateAnimes);
  updateAnimes();
  renderPredictions(data.animes, data.members);

  document.getElementById("prev-btn")?.addEventListener("click", () => {
    const person = personSel.value;
    const anime = data.animes.find((a) => a.id === animeSel.value);
    if (!anime || !slider) return;

    const predicted = parseFloat(slider.value).toFixed(1);
    const member = data.members.find(m => m.nickname === person);
    const color = member?.color || "#a78bfa";

    savePrediction({
      person,
      animeId: anime.id,
      animeName: anime.name,
      predicted,
      savedAt: Date.now(),
    });

    const result = document.getElementById("prev-result");
    const fav = stripEmoji(favoriteGenre(data.animes, person));
    const genreMatch = (anime.genres || []).some(
      (g) => stripEmoji(g).toLowerCase() === fav.toLowerCase(),
    );
    const watchedCount = animesOf(data.animes, person).length;

    result.innerHTML = `
      <div class="previsao-output">
        <div class="previsao-score-wrap">
          <div class="previsao-score" style="color:${color}">${predicted}</div>
          <div class="previsao-score-label">/10</div>
        </div>
        <div class="previsao-anime-name">${escapeHTML(anime.name)}</div>
        <div class="previsao-person-label">Previsão de <span style="color:${color};font-weight:900">${person}</span> registrada ✓</div>
        <div class="previsao-tags">
          <span class="ptag">Gênero fav: ${fav}</span>
          ${genreMatch ? `<span class="ptag green">✓ Gênero combina!</span>` : ""}
          <span class="ptag">Nota do grupo: ${formatNota(anime.nota)}</span>
          <span class="ptag">${watchedCount} animes no histórico</span>
        </div>
        <p class="previsao-note">A nota real aparece automaticamente quando ${person} registrar o voto no acervo.</p>
      </div>
    `;
    result.classList.remove("hidden");
    renderPredictions(data.animes, data.members);
  });
}

// ── ❓ Anime Misterioso ───────────────────────────────────────────────────────

let mystery = null;
let mysteryDone = false;

function loadMystery(animes, members) {
  const pool = animes.filter((a) => a.nota !== null && a.qtdVotos > 1);
  if(!pool.length) return;
  
  mystery = pool[Math.floor(Math.random() * pool.length)];
  mysteryDone = false;
  
  const input = document.getElementById("misterio-guess");
  if(input) input.value = "";
  
  const fb = document.getElementById("misterio-feedback");
  if(fb) {
    fb.classList.add("hidden");
    fb.innerHTML = "";
  }

  const genres = (mystery.genres || []).map((g) => `<span class="mchip">${g}</span>`).join("");

  const watchers = (mystery.quemAssistiu || [])
    .map(
      (p) => {
        const m = members.find(member => member.nickname === p);
        const color = m?.color || "#888";
        return `<span class="mperson" style="background:${color}22;border:1.5px solid ${color}88;color:${color}" title="${p}">${p[0].toUpperCase()}</span>`;
      }
    )
    .join("");

  const clues = document.getElementById("misterio-clues");
  if(clues) {
    clues.innerHTML = `
      <div class="mystery-board">
        <div class="mystery-stat-grid">
          <div class="mstat">
            <div class="mstat-label">Nota média</div>
            <div class="mstat-value nota-glow">${formatNota(mystery.nota)}</div>
          </div>
          <div class="mstat">
            <div class="mstat-label">Votos</div>
            <div class="mstat-value">${mystery.qtdVotos}</div>
          </div>
          <div class="mstat">
            <div class="mstat-label">Controvérsia</div>
            <div class="mstat-value">${Number(mystery.controversia || 0).toFixed(1)}</div>
          </div>
        </div>
        <div class="mstat-full">
          <div class="mstat-label">Gêneros</div>
          <div class="mystery-chips">${genres}</div>
        </div>
        <div class="mstat-full">
          <div class="mstat-label">Quem assistiu</div>
          <div class="mystery-persons">${watchers}</div>
        </div>
      </div>
    `;
  }
}

function initMisterio(data) {
  loadMystery(data.animes, data.members);

  const guess = document.getElementById("misterio-guess");
  const fb = document.getElementById("misterio-feedback");

  function submit() {
    if (mysteryDone || !mystery) return;
    const g = guess.value.trim().toLowerCase();
    const name = mystery.name.toLowerCase();
    const ok = name.includes(g) || g.includes(name.split(":")[0].trim().toLowerCase().slice(0, 6));
    if (ok) {
      fb.innerHTML = `<div class="fb-win">🎉 Acertou! É <strong>${escapeHTML(mystery.name)}</strong></div>`;
      mysteryDone = true;
    } else {
      fb.innerHTML = `<div class="fb-miss">❌ Não foi… tente novamente ou revele.</div>`;
    }
    fb.classList.remove("hidden");
  }

  document.getElementById("misterio-submit")?.addEventListener("click", submit);
  guess?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  document.getElementById("misterio-reveal")?.addEventListener("click", () => {
    if (!mystery) return;
    fb.innerHTML = `<div class="fb-reveal">👁 Era: <strong>${escapeHTML(mystery.name)}</strong> — ${formatNota(mystery.nota)}</div>`;
    fb.classList.remove("hidden");
    mysteryDone = true;
  });

  document
    .getElementById("misterio-next")
    ?.addEventListener("click", () => loadMystery(data.animes, data.members));
}

// ── 📊 Timeline ──────────────────────────────────────────────────────────────

function initTimeline(data) {
  const animes = data.animes;
  const c = document.getElementById("timeline-content");
  if(!c) return;

  const allRated = animes.filter((a) => a.nota !== null && a.qtdVotos > 1);
  const top1 = [...allRated].sort((a, b) => Number(b.nota) - Number(a.nota))[0];
  const hottest = [...allRated].sort((a, b) => (Number(b.controversia) || 0) - (Number(a.controversia) || 0))[0];
  const mostVoted = [...animes].sort((a, b) => (b.qtdVotos || 0) - (a.qtdVotos || 0))[0];

  const memberCards = data.members.map((m) => {
    const person = m.nickname;
    const watched = animesOf(animes, person);
    const avg = avgNota(animes, person);
    const fav = stripEmoji(favoriteGenre(animes, person));
    
    const topAnime = watched
      .filter((a) => a[`nota${person}`] !== null)
      .sort((a, b) => Number(b[`nota${person}`]) - Number(a[`nota${person}`]))[0];
    
    const color = m.color || "#888";
    
    return `
      <div class="tmember" style="--c:${color};--cl:${color}">
        <div class="tmember-name">${person}</div>
        <div class="tmember-stats">
          <div class="ts"><span>Assistidos</span><strong>${watched.length}</strong></div>
          <div class="ts"><span>Média</span><strong>${avg ? Number(avg).toFixed(1) : "—"}</strong></div>
          <div class="ts"><span>Gênero fav.</span><strong>${fav}</strong></div>
          <div class="ts"><span>Exclusivos</span><strong>${watched.filter((a) => (a.quemAssistiu || []).length === 1).length}</strong></div>
        </div>
        ${topAnime ? `<div class="tmember-top"><span>⭐ Favorito</span><strong>${escapeHTML(topAnime.name)}</strong><em>${formatNota(topAnime[`nota${person}`])}</em></div>` : ""}
      </div>
    `;
  }).join("");

  c.innerHTML = `
    <div class="tl-section">
      <h3 class="tl-title">🏆 Recordes do Grupo</h3>
      <div class="tl-records">
        <div class="tl-record"><div class="tlr-icon">⭐</div><div><small>Melhor avaliado</small><strong>${escapeHTML(top1?.name ?? "—")}</strong><span>${formatNota(top1?.nota)}</span></div></div>
        <div class="tl-record"><div class="tlr-icon">🌶️</div><div><small>Mais controverso</small><strong>${escapeHTML(hottest?.name ?? "—")}</strong><span>${Number(hottest?.controversia || 0).toFixed(1)} de diferença</span></div></div>
        <div class="tl-record"><div class="tlr-icon">👥</div><div><small>Mais assistido</small><strong>${escapeHTML(mostVoted?.name ?? "—")}</strong><span>${mostVoted?.qtdVotos ?? 0} votos</span></div></div>
        <div class="tl-record"><div class="tlr-icon">📚</div><div><small>Total no acervo</small><strong>${animes.length} animes</strong><span>${allRated.length} com nota</span></div></div>
      </div>
    </div>
    <div class="tl-section">
      <h3 class="tl-title">👤 Perfil dos Membros</h3>
      <div class="tmembers-grid">${memberCards}</div>
    </div>
  `;
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const data = await loadData();
  initPrevisao(data);
  initMisterio(data);
  initTimeline(data);
  // Garante que o container da batalha existe antes de chamar
  const batContainer = document.getElementById("batalha-container");
  if(batContainer) initBatalha(batContainer, data.animes);
}

init().catch(console.error);
