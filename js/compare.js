import {
  animesOf,
  commonAnimes,
  countGenres,
  topGenres,
  cleanGenreLabel,
  getPersonNota,
  getPersonColor,
} from "./data.js";
import { hexToRgba, escapeHTML, shortText } from "./utils.js";

Chart.defaults.color = "#b8c0d9";
Chart.defaults.font.family = "'Inter', sans-serif";

let allAnimes = [];
let radarChart = null;
let currentMembers = [];

export function initCompare(animes, members) {
  allAnimes = animes || [];
  currentMembers = members || [];

  const person1 = document.getElementById("person1");
  const person2 = document.getElementById("person2");
  if (!person1 || !person2) return;

  populateSelects(person1, person2);
  setupComparePickers(person1, person2);

  person1.addEventListener("change", () => { syncComparePickers(); renderCompare(); });
  person2.addEventListener("change", () => { syncComparePickers(); renderCompare(); });

  renderCompare();
}

function populateSelects(select1, select2) {
  select1.innerHTML = "";
  select2.innerHTML = "";

  currentMembers.forEach((member, index) => {
    const o1 = document.createElement("option");
    o1.value = member.nickname;
    o1.textContent = member.nickname;
    if (index === 0) o1.selected = true;
    select1.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = member.nickname;
    o2.textContent = member.nickname;
    if (index === 1 || (currentMembers.length === 1 && index === 0)) o2.selected = true;
    select2.appendChild(o2);
  });
}

function setupComparePickers(...selects) {
  document.querySelectorAll(".compare-picker").forEach((p) => p.remove());

  selects.forEach((select) => {
    select.classList.add("compare-native-select");
    const picker = document.createElement("div");
    picker.className = "compare-picker";
    picker.dataset.selectId = select.id;
    picker.innerHTML = `
      <button class="compare-picker-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span></span>
      </button>
      <div class="compare-picker-menu" role="listbox"></div>
    `;
    select.insertAdjacentElement("afterend", picker);
    renderComparePicker(select);
  });

  document.addEventListener("click", closeComparePickers);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeComparePickers(); });
}

function renderComparePicker(select) {
  const picker = document.querySelector(`.compare-picker[data-select-id="${select.id}"]`);
  if (!picker) return;

  const trigger = picker.querySelector(".compare-picker-trigger");
  const label = trigger.querySelector("span");
  const menu = picker.querySelector(".compare-picker-menu");
  const selected = select.options[select.selectedIndex];

  label.textContent = selected?.textContent || "Selecionar";
  menu.innerHTML = Array.from(select.options)
    .map((opt) => `
      <button type="button" role="option" data-value="${escapeHTML(opt.value)}"
        aria-selected="${opt.selected ? "true" : "false"}">
        <span>${escapeHTML(opt.textContent)}</span>
      </button>`)
    .join("");

  trigger.onclick = (e) => {
    e.stopPropagation();
    const isOpen = picker.classList.contains("open");
    closeComparePickers();
    picker.classList.toggle("open", !isOpen);
    trigger.setAttribute("aria-expanded", String(!isOpen));
  };

  menu.onclick = (e) => {
    const btn = e.target.closest("[data-value]");
    if (!btn) return;
    select.value = btn.dataset.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    closeComparePickers();
  };
}

function syncComparePickers() {
  document.querySelectorAll(".compare-native-select").forEach((s) => renderComparePicker(s));
}

function closeComparePickers() {
  document.querySelectorAll(".compare-picker.open").forEach((p) => {
    p.classList.remove("open");
    p.querySelector(".compare-picker-trigger")?.setAttribute("aria-expanded", "false");
  });
}

function renderCompare() {
  const p1 = document.getElementById("person1")?.value;
  const p2 = document.getElementById("person2")?.value;
  if (!p1 || !p2) return;

  renderAffinityPanel(p1, p2);
  renderSummary(p1, p2);
  renderVenn(p1, p2);
  renderRadar(p1, p2);
  renderCommonTable(p1, p2);
}

function renderAffinityPanel(p1, p2) {
  const wrap = document.getElementById("venn4-container");
  if (!wrap) return;

  const shared = commonAnimes(allAnimes, p1, p2);
  if (!shared.length) {
    wrap.innerHTML = '<div class="empty-state"><p>Sem animes em comum para comparar.</p></div>';
    return;
  }

  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);
  const avg1 = avgScore(shared, p1);
  const avg2 = avgScore(shared, p2);

  const scored = shared
    .map((anime) => {
      const n1 = getPersonNota(anime, p1);
      const n2 = getPersonNota(anime, p2);
      const diff = n1 !== null && n2 !== null ? Math.abs(n1 - n2) : null;
      return { anime, n1, n2, diff, avg: ((Number(n1) || 0) + (Number(n2) || 0)) / 2 };
    })
    .filter((x) => x.diff !== null);

  const bestMatch = [...scored].sort((a, b) => a.diff - b.diff || b.avg - a.avg)[0];
  const worstMatch = [...scored].sort((a, b) => b.diff - a.diff || b.avg - a.avg)[0];

  const avgDiff = scored.reduce((s, x) => s + x.diff, 0) / Math.max(scored.length, 1);
  const exact = scored.filter((x) => x.diff === 0).length;
  const close = scored.filter((x) => x.diff > 0 && x.diff <= 0.5).length;
  const oneStar = scored.filter((x) => x.diff > 0.5 && x.diff <= 1.5).length;
  const hot = scored.filter((x) => x.diff > 1.5).length;
  const compat = Math.max(0, Math.round(100 - avgDiff * 22));

  const topGenreList = Object.entries(countGenres(shared))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const stricter = avg1 < avg2 ? p1 : p2;
  const softer = stricter === p1 ? p2 : p1;

  wrap.innerHTML = `
    <div class="cmp-compat">
      <div class="cmp-compat-top">
        <div class="cmp-compat-main">
          <div class="cmp-compat-label">Compatibilidade</div>
          <div class="cmp-compat-pct">${compat}<small>%</small></div>
          <div class="cmp-compat-bar">
            <div class="cmp-compat-bar-fill" style="width:${compat}%"></div>
          </div>
          <div class="cmp-compat-tag">✧ ${compat >= 70 ? "Match forte" : compat >= 45 ? "Match moderado" : "Gostos distintos"}</div>
        </div>

        <div class="cmp-stat-mini" style="--c:${c1}">
          <div class="cmp-stat-mini-icon">♚</div>
          <strong>${fmtScore(avg1)}</strong>
          <span>média de ${escapeHTML(p1)}</span>
        </div>

        <div class="cmp-stat-mini" style="--c:${c2}">
          <div class="cmp-stat-mini-icon">▤</div>
          <strong>${fmtScore(avg2)}</strong>
          <span>média de ${escapeHTML(p2)}</span>
        </div>
      </div>

      <div class="cmp-bands">
        <div class="cmp-band" style="--bc:#4ade80">
          <div class="cmp-band-icon">✓</div>
          <div class="cmp-band-info">
            <div class="cmp-band-num">${exact}</div>
            <div class="cmp-band-lbl">Notas iguais</div>
          </div>
        </div>
        <div class="cmp-band" style="--bc:#22d3ee">
          <div class="cmp-band-icon">∿</div>
          <div class="cmp-band-info">
            <div class="cmp-band-num">${close}</div>
            <div class="cmp-band-lbl">Quase iguais</div>
          </div>
        </div>
        <div class="cmp-band" style="--bc:#fbbf24">
          <div class="cmp-band-icon">☆</div>
          <div class="cmp-band-info">
            <div class="cmp-band-num">${oneStar}</div>
            <div class="cmp-band-lbl">1 estrela de diff</div>
          </div>
        </div>
        <div class="cmp-band" style="--bc:#fb7185">
          <div class="cmp-band-icon">✦</div>
          <div class="cmp-band-info">
            <div class="cmp-band-num">${hot}</div>
            <div class="cmp-band-lbl">Notas opostas</div>
          </div>
        </div>
      </div>

      <div class="cmp-panels">
        <div class="cmp-panel">
          <div class="cmp-panel-label">Maior acordo</div>
          <div class="cmp-panel-title">${escapeHTML(bestMatch ? shortText(bestMatch.anime.name, 36) : "—")}</div>
          <div class="cmp-panel-sub">${bestMatch ? `${escapeHTML(p1)} ${fmtScore(bestMatch.n1)} · ${escapeHTML(p2)} ${fmtScore(bestMatch.n2)}` : ""}</div>
        </div>
        <div class="cmp-panel">
          <div class="cmp-panel-label">Maior divergência</div>
          <div class="cmp-panel-title">${escapeHTML(worstMatch ? shortText(worstMatch.anime.name, 36) : "—")}</div>
          <div class="cmp-panel-sub">${worstMatch ? `${escapeHTML(p1)} ${fmtScore(worstMatch.n1)} · ${escapeHTML(p2)} ${fmtScore(worstMatch.n2)} · gap ${worstMatch.diff.toFixed(1)}` : ""}</div>
        </div>
        <div class="cmp-panel">
          <div class="cmp-panel-label">Gêneros em comum</div>
          <div class="cmp-panel-tags">
            ${topGenreList.length
              ? topGenreList.map(([g, c]) => `<span class="cmp-tag">${escapeHTML(cleanGenreLabel(g))}<small>${c}</small></span>`).join("")
              : '<span class="cmp-tag">Sem gênero dominante</span>'}
          </div>
        </div>
        <div class="cmp-panel is-gap">
          <div class="cmp-panel-label">Gap de notas</div>
          <div class="cmp-panel-title">Diff média: ${avgDiff.toFixed(2)}</div>
          <div class="cmp-gap-reading">${escapeHTML(stricter)} tende a ser mais rigoroso, ${escapeHTML(softer)} mais generoso nos títulos em comum.</div>
        </div>
      </div>
    </div>
  `;
}

function renderSummary(p1, p2) {
  const wrap = document.getElementById("compare-summary");
  if (!wrap) return;

  const a1 = animesOf(allAnimes, p1);
  const a2 = animesOf(allAnimes, p2);
  const common = commonAnimes(allAnimes, p1, p2);
  const only1 = a1.length - common.length;
  const only2 = a2.length - common.length;
  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);

  wrap.innerHTML = `
    <div class="cmp-summary">
      <div class="cmp-summary-pill" style="--sc:#4ade80">
        <div class="cmp-summary-ico">◉</div>
        <div class="cmp-summary-body">
          <div class="cmp-summary-val">${common.length}</div>
          <div class="cmp-summary-desc">em comum</div>
        </div>
        <div class="cmp-summary-name">Total</div>
      </div>
      <div class="cmp-summary-pill" style="--sc:${c1}">
        <div class="cmp-summary-ico">◎</div>
        <div class="cmp-summary-body">
          <div class="cmp-summary-val">${only1}</div>
          <div class="cmp-summary-desc">exclusivos</div>
        </div>
        <div class="cmp-summary-name">${escapeHTML(p1)}</div>
      </div>
      <div class="cmp-summary-pill" style="--sc:${c2}">
        <div class="cmp-summary-ico">☆</div>
        <div class="cmp-summary-body">
          <div class="cmp-summary-val">${only2}</div>
          <div class="cmp-summary-desc">exclusivos</div>
        </div>
        <div class="cmp-summary-name">${escapeHTML(p2)}</div>
      </div>
      <div class="cmp-summary-pill" style="--sc:rgba(255,255,255,.3)">
        <div class="cmp-summary-ico">▱</div>
        <div class="cmp-summary-body">
          <div class="cmp-summary-val">${only1 + common.length + only2}</div>
          <div class="cmp-summary-desc">total único</div>
        </div>
        <div class="cmp-summary-name">Soma</div>
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
    <div class="cmp-venn-wrap">
      <div class="cmp-venn-circle left" style="--vc:${c1}">
        <strong>${only1}</strong>
        <span>Só ${escapeHTML(p1)}</span>
      </div>
      <div class="cmp-venn-overlap">
        <strong>${common.length}</strong>
        <span>Comum</span>
      </div>
      <div class="cmp-venn-circle right" style="--vc:${c2}">
        <strong>${only2}</strong>
        <span>Só ${escapeHTML(p2)}</span>
      </div>
    </div>
  `;
}

function renderRadar(p1, p2) {
  const canvas = document.getElementById("chartRadar");
  if (!canvas) return;

  const allTop = topGenres(allAnimes, 6).map(([g]) => g);
  const labels = allTop.map(cleanGenreLabel);

  const genreVector = (person) => {
    const mine = animesOf(allAnimes, person);
    const map = countGenres(mine);
    const total = mine.length || 1;
    return allTop.map((g) => Math.round(((map[g] || 0) / total) * 100));
  };

  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);

  if (radarChart) radarChart.destroy();

  radarChart = new Chart(canvas, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: p1,
          data: genreVector(p1),
          backgroundColor: hexToRgba(c1, 0.15),
          borderColor: c1,
          borderWidth: 2,
          pointBackgroundColor: c1,
          pointBorderColor: c1,
          pointRadius: 3,
        },
        {
          label: p2,
          data: genreVector(p2),
          backgroundColor: hexToRgba(c2, 0.13),
          borderColor: c2,
          borderWidth: 2,
          pointBackgroundColor: c2,
          pointBorderColor: c2,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#eef2ff", boxWidth: 24, boxHeight: 10, padding: 14 },
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { display: false },
          angleLines: { color: "rgba(186,194,221,.14)" },
          grid: { color: "rgba(186,194,221,.14)" },
          pointLabels: { color: "#e8ecff", font: { size: 12, weight: 600 } },
        },
      },
    },
  });
}

function renderCommonTable(p1, p2) {
  const wrap = document.getElementById("common-table-wrap");
  if (!wrap) return;

  const common = commonAnimes(allAnimes, p1, p2).sort(
    (a, b) => (Number(b.nota) || 0) - (Number(a.nota) || 0),
  );

  if (!common.length) {
    wrap.innerHTML = `<div class="empty-state">Nenhum anime em comum entre ${escapeHTML(p1)} e ${escapeHTML(p2)}.</div>`;
    return;
  }

  const c1 = getPersonColor(p1);
  const c2 = getPersonColor(p2);

  const buildRows = (list) =>
    list.map((anime) => {
      const n1 = getPersonNota(anime, p1);
      const n2 = getPersonNota(anime, p2);
      const diff = n1 !== null && n2 !== null ? Math.abs(n1 - n2) : 0;
      return `
        <tr class="${diff >= 2 ? "hot" : ""}" data-name="${escapeHTML(anime.name.toLowerCase())}">
          <td>
            <div class="cmp-anime-cell">
              <img src="${anime.image_url || "assets/nyx-icon.webp"}" alt="${escapeHTML(anime.name)}" loading="lazy" />
              <div>
                <strong>${escapeHTML(shortText(anime.name, 44))}</strong>
                <span>${escapeHTML((anime.genres || []).slice(0, 2).map(cleanGenreLabel).join(" · "))}</span>
              </div>
            </div>
          </td>
          <td class="cmp-score" style="color:${c1}">${n1 !== null ? Number(n1).toFixed(1) : "—"}</td>
          <td class="cmp-score" style="color:${c2}">${n2 !== null ? Number(n2).toFixed(1) : "—"}</td>
          <td class="cmp-diff">${diff.toFixed(1)}</td>
        </tr>`;
    }).join("");

  wrap.innerHTML = `
    <input class="cmp-search" type="search" placeholder="🔍  Buscar anime..." aria-label="Filtrar" />
    <div class="cmp-table-scroll">
      <table class="cmp-table">
        <thead>
          <tr>
            <th>Anime</th>
            <th style="color:${c1}">${escapeHTML(p1)}</th>
            <th style="color:${c2}">${escapeHTML(p2)}</th>
            <th>Diff</th>
          </tr>
        </thead>
        <tbody id="cmp-tbody">${buildRows(common)}</tbody>
      </table>
    </div>
  `;

  const input = wrap.querySelector(".cmp-search");
  const tbody = wrap.querySelector("#cmp-tbody");
  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    tbody.querySelectorAll("tr").forEach((row) => {
      row.style.display = !q || row.dataset.name.includes(q) ? "" : "none";
    });
  });
}

function avgScore(animes, person) {
  const scores = animes
    .map((a) => getPersonNota(a, person))
    .filter((s) => s !== null)
    .map(Number);
  return scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
}

function fmtScore(v) {
  return Number(v || 0).toFixed(2);
}
