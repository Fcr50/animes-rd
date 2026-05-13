// js/home.js
import { supabase } from './supabase-client.js';
import { animesOf, avgNota, favoriteGenre, formatNota, getPersonNota, loadData, mostControversial } from "./data.js";
import { escapeHTML, shortText, shuffleItems, getGroupId, stripEmoji } from "./utils.js";

let _members = [];
let _currentUser = null;

const FEATURED_ROTATION_MINUTES = 30;
const YOUTUBE_PLAYLIST_URL = "https://youtube.com/playlist?list=PLjNlQ2vXx1xbt30X8TcUfNzw_akVISXEu";
const SPOTIFY_PLAYLIST_URL = "https://open.spotify.com/playlist/2Uz95kBY93CizCzICWnx3d";
const MAL_NEWS_URL = "https://myanimelist.net/news";

let featuredCommentTimer = null;
let heroInfoTimer = null;

// --- 🖼️ DESTAQUES ---

function featuredAnimeForNow(animes) {
  const candidates = animes.filter((anime) => Number(anime.nota) >= 9.0);
  if (!candidates.length) return animes.sort((a, b) => (Number(b.nota) || 0) - (Number(a.nota) || 0))[0];
  const block = Math.floor(Date.now() / (FEATURED_ROTATION_MINUTES * 60 * 1000));
  return candidates[block % candidates.length];
}

function renderHeroInfoRotator(data, featuredAnime) {
  const rotator = document.getElementById("blog-hero-rotator");
  if (!rotator) return;
  if (heroInfoTimer) clearInterval(heroInfoTimer);

  const subtitle = `${data.total} animes catalogados, atualizado em ${new Date().toLocaleDateString("pt-BR")}. Um blog para transformar nota, treta e recomendação em leitura.`;
  const featuredTitle = featuredAnime?.name || "o proximo anime";

  const slides = [
    { tone: "blog", eyebrow: `Blog <span class="brand-gradient">Animes RD</span>`, title: "Críticas, rankings e guias para decidir o próximo anime.", text: subtitle, visuals: [] },
    { tone: "playlists", eyebrow: "Playlists do grupo", title: "Openings para deixar tocando enquanto escolhe.", text: "Duas playlists pra entrar no clima: YouTube e Spotify, com a vibe do Animes RD.", visuals: [{ label: "YouTube", src: "https://cdn.simpleicons.org/youtube/FF0033", href: YOUTUBE_PLAYLIST_URL }, { label: "Spotify", src: "https://cdn.simpleicons.org/spotify/1ED760", href: SPOTIFY_PLAYLIST_URL }] },
    { tone: "news", eyebrow: "Notícias", title: "Radar MyAnimeList para novidades da temporada.", text: "Um atalho para acompanhar anúncios, trailers, estreias e movimentações do mundo dos animes.", visuals: [{ label: "MAL", src: "https://cdn.simpleicons.org/myanimelist/2E51A2", href: MAL_NEWS_URL }] },
    { tone: "featured", eyebrow: "Dica em destaque", title: `Hoje o acervo esta puxando: ${featuredTitle}.`, text: featuredAnime ? `Nota geral ${formatNota(featuredAnime.nota)} com ${featuredAnime.qtdVotos} votos no grupo.` : "Aguardando recomendações.", visuals: [] }
  ];

  rotator.innerHTML = slides.map((s, i) => `
      <section class="blog-hero-slide ${i === 0 ? "active" : ""}" data-hero-slide="${i}" data-hero-tone="${s.tone}">
        <div class="blog-hero-slide-copy">
          <span class="eyebrow">${s.eyebrow}</span>
          <h1>${s.title}</h1>
          <p>${s.text}</p>
        </div>
        ${s.visuals.length ? `<div class="blog-hero-slide-footer"><div class="blog-hero-visual">${s.visuals.map(v => `<a href="${v.href}" target="_blank" rel="noopener noreferrer"><img src="${v.src}" /></a>`).join("")}</div></div>` : ""}
      </section>`).join("") + 
      `<div class="blog-hero-dots">${slides.map((_, i) => `<button class="${i === 0 ? "active" : ""}" data-hero-dot="${i}"></button>`).join("")}</div>`;

  let active = 0;
  const host = rotator.closest(".blog-hero-copy");
  const showSlide = (next) => {
    const slideEls = rotator.querySelectorAll("[data-hero-slide]");
    const dots = rotator.querySelectorAll("[data-hero-dot]");
    if(!slideEls.length) return;
    slideEls[active]?.classList.remove("active");
    dots[active]?.classList.remove("active");
    active = (next + slideEls.length) % slideEls.length;
    slideEls[active]?.classList.add("active");
    dots[active]?.classList.add("active");
    host?.setAttribute("data-hero-tone", slides[active].tone);
  };

  const startTimer = () => {
    if (heroInfoTimer) clearInterval(heroInfoTimer);
    heroInfoTimer = setInterval(() => showSlide(active + 1), 10000);
  };

  rotator.querySelectorAll("[data-hero-dot]").forEach(dot => {
    dot.onclick = (e) => {
      e.preventDefault();
      showSlide(Number(dot.dataset.heroDot));
      startTimer();
    };
  });
  startTimer();
}

async function renderHero(data) {
  const top = featuredAnimeForNow(data.animes);
  renderHeroInfoRotator(data, top);
  const heroPanel = document.getElementById("hero-panel");
  
  if (top && top.image_url && heroPanel) {
    heroPanel.style.setProperty("--hero-anime-bg", `url("${top.image_url}")`);
    heroPanel.classList.add("has-bg");
    // O link agora inclui o parâmetro open para abrir o modal automaticamente
    const href = `acervo.html#g=${getGroupId()}&open=${top.mal_id}`;
    heroPanel.innerHTML = `
      <span class="post-kicker">Destaque do acervo</span>
      <h2>${top.name}</h2>
      <p>Nota ${formatNota(top.nota)} no grupo.</p>
      <a href="${href}">Ler no acervo</a>
    `;
  }
}

// --- 💬 COMENTÁRIOS ---

function renderFeaturedPost(animes) {
  const wall = document.getElementById("featured-post");
  if(!wall) return;
  wall.innerHTML = `<h2 class="featured-comment-title">Comentários</h2><div class="featured-comment-wall" id="featured-comments"></div>`;

  // Extrai comentários de todos os animes incluindo o mal_id
  const allComments = animes.flatMap(a => {
    if(!a.comentarios) return [];
    return a.comentarios.split('\n').map(line => {
      const parts = line.split(': ');
      return { 
        person: parts[0], 
        text: parts[1] || "", 
        anime: a.name,
        malId: a.mal_id // Guardamos o ID para o link
      };
    });
  }).filter(c => c.text.length > 5);

  const shuffled = shuffleItems(allComments);
  const container = document.getElementById("featured-comments");

  let startIndex = 0;
  const rotate = () => {
    if (shuffled.length === 0) return;
    
    // Pega 8 comentários em sequência, voltando ao início se necessário
    const batch = [];
    for (let i = 0; i < 8; i++) {
      batch.push(shuffled[(startIndex + i) % shuffled.length]);
    }

    const groupId = getGroupId();
    if(container) {
      // Adiciona uma pequena transição de fade ao trocar
      container.style.opacity = "0";
      setTimeout(() => {
        container.innerHTML = batch.map((c, i) => {
          const color = _members.find(m => m.nickname === c.person)?.color || "#a78bfa";
          const href = `acervo.html#g=${groupId}&open=${c.malId}`;
          return `
            <a href="${href}" class="comment-balloon comment-balloon-${i+1}" style="--balloon-color:${color}" title="Ver ${c.anime} no acervo">
              <strong>${c.person}</strong>
              <p>${shortText(c.text, 100)}</p>
            </a>`;
        }).join("");
        container.style.opacity = "1";
      }, 500);
    }
    
    startIndex = (startIndex + 8) % shuffled.length;
  };

  rotate();
  if (featuredCommentTimer) clearInterval(featuredCommentTimer);
  featuredCommentTimer = setInterval(rotate, 30000); // 30 segundos conforme solicitado
}

// --- 🎶 OPENINGS ---

function renderOpeningChipsLegacy(member) {
  const ops = member.openings || [];
  const canEdit = _currentUser?.id === member.user_id;
  
  // SEMPRE garante uma lista de 3 slots (preenchidos ou vazios)
  const fullList = [
    ops[0] || { name: "Adicionar Abertura 1", url: "" },
    ops[1] || { name: "Adicionar Abertura 2", url: "" },
    ops[2] || { name: "Adicionar Abertura 3", url: "" }
  ];

  return fullList.map((op, i) => {
    const isPlaceholder = !op.url && op.name.includes("Adicionar");
    
    let content;
    if (op.url) {
      content = `<a class="opening-chip" href="${escapeHTML(op.url)}" target="_blank" rel="noopener noreferrer"><b>${i+1}</b>${escapeHTML(op.name)}</a>`;
    } else {
      content = `<span class="opening-chip placeholder"><b>${i+1}</b>${escapeHTML(op.name)}</span>`;
    }
    
    const editBtn = canEdit ? `<button class="opening-edit-btn" onclick="window.editOpening('${member.user_id}', ${i})" style="cursor:pointer; background:none; border:none; margin-left:5px; font-size:10px;">✎</button>` : "";
    
    return `<div class="opening-chip-wrap">${content}${editBtn}</div>`;
  }).join("");
}

window.editOpeningLegacy = (uid, i) => {
  const m = _members.find(m => m.user_id === uid);
  const op = (m.openings || [])[i] || { name: "", url: "" };
  const wrap = document.getElementById(`openings-container-${uid}`);
  if (!wrap) return;
  const formHtml = `<div class="opening-inline-form" style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; margin-top: 10px;"><input id="op-n-${i}" type="text" value="${escapeHTML(op.name)}" style="width: 100%; margin-bottom: 5px; font-size: 11px; padding: 4px;" /><input id="op-u-${i}" type="url" value="${escapeHTML(op.url)}" style="width: 100%; margin-bottom: 8px; font-size: 11px; padding: 4px;" /><div style="display:flex; gap:5px"><button onclick="window.saveOp('${uid}',${i})" style="background:var(--accent); color:white; border:none; padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer;">Salvar</button><button onclick="window.refreshMemberCards()" style="background:none; color:white; border:1px solid var(--border); padding:4px 8px; border-radius:4px; font-size:10px; cursor:pointer;">Cancelar</button></div></div>`;
  document.querySelectorAll(".opening-inline-form").forEach(el => el.remove());
  wrap.insertAdjacentHTML('beforeend', formHtml);
};

window.saveOp = async (uid, i) => {
  const name = document.getElementById(`op-n-${i}`).value.trim();
  const url = document.getElementById(`op-u-${i}`).value.trim();
  const m = _members.find(m => m.user_id === uid);
  const ops = [...(m.openings || [{name:"",url:""},{name:"",url:""},{name:"",url:""}])];
  ops[i] = { name, url };
  await supabase.from('group_members').update({ openings: ops }).eq('group_id', getGroupId()).eq('user_id', uid);
  window.location.reload();
};

window.refreshMemberCards = () => window.location.reload();

function renderOpeningChips(member) {
  const ops = member.openings || [];
  const canEdit = _currentUser?.id === member.user_id;

  const fullList = [
    ops[0] || { name: "Adicionar Abertura 1", url: "" },
    ops[1] || { name: "Adicionar Abertura 2", url: "" },
    ops[2] || { name: "Adicionar Abertura 3", url: "" }
  ];

  return fullList.map((op, i) => {
    const content = op.url
      ? `<a class="opening-chip" href="${escapeHTML(op.url)}" target="_blank" rel="noopener noreferrer"><b>${i + 1}</b>${escapeHTML(op.name)}</a>`
      : `<span class="opening-chip placeholder"><b>${i + 1}</b>${escapeHTML(op.name)}</span>`;

    const editBtn = canEdit
      ? `<button class="opening-edit-btn" type="button" onclick="window.editOpening('${member.user_id}', ${i})" aria-label="Editar abertura ${i + 1}">✎</button>`
      : "";

    return `<div class="opening-chip-wrap">${content}${editBtn}</div>`;
  }).join("");
}

window.editOpening = (uid, i) => {
  const m = _members.find((member) => member.user_id === uid);
  const op = (m.openings || [])[i] || { name: "", url: "" };
  const wrap = document.getElementById(`openings-container-${uid}`);
  if (!wrap) return;

  const formHtml = `
    <div class="opening-inline-form">
      <input
        id="op-n-${i}"
        class="opening-form-input"
        type="text"
        value="${escapeHTML(op.name)}"
        placeholder="Nome da abertura"
      />
      <input
        id="op-u-${i}"
        class="opening-form-input"
        type="url"
        value="${escapeHTML(op.url)}"
        placeholder="https://youtube.com/..."
      />
      <div class="opening-form-actions">
        <button class="opening-save-btn" type="button" onclick="window.saveOp('${uid}',${i})">Salvar</button>
        <button class="opening-cancel-btn" type="button" onclick="window.refreshMemberCards()">Cancelar</button>
      </div>
    </div>
  `;

  document.querySelectorAll(".opening-inline-form").forEach((el) => el.remove());
  wrap.insertAdjacentHTML("beforeend", formHtml);
};

// --- 📊 RANKINGS ---

function colorToRgb(color) {
  if (!color) return "139, 92, 246";
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `${r}, ${g}, ${b}`;
}

function renderMemberPosts(animes, members) {
  const container = document.getElementById("member-grid");
  if(!container) return;
  container.innerHTML = members.map(m => {
    const watched = animesOf(animes, m.nickname);
    const avg = avgNota(animes, m.nickname);
    const fav = favoriteGenre(animes, m.nickname);
    const top = watched.sort((a,b) => Number(getPersonNota(b, m.nickname)) - Number(getPersonNota(a, m.nickname))).slice(0,3);
    const rgb = colorToRgb(m.color);
    const memberColor = m.color || "#8b5cf6";
    const inlineBg = `background: linear-gradient(160deg, rgba(${rgb}, 0.25) 0%, rgba(24, 23, 29, 0.96) 60%) !important; border-color: rgba(${rgb}, 0.4) !important;`;
    return `
      <article class="post-card" style="${inlineBg} --member-color:${memberColor}; --member-color-rgb:${rgb}">
        <h3 style="color: white !important;"><span>Top 3</span>${m.nickname}</h3>
        <p>${watched.length} animes vistos, média ${formatNota(avg)} e gênero favorito: ${fav}.</p>
        <ol>${top.map(a => `<li><span>${shortText(a.name, 32)}</span><strong>${formatNota(getPersonNota(a, m.nickname))}</strong></li>`).join("")}</ol>
        <div class="post-tags post-openings" id="openings-container-${m.user_id}">
          <strong>Top 3 openings</strong>
          <div class="opening-list" id="openings-${m.user_id}">${renderOpeningChips(m)}</div>
        </div>
        <a href="profile.html#p=${m.nickname}&g=${getGroupId()}" style="background: transparent !important; color: white !important; border: none !important; padding: 0 !important; font-size: 13px !important; text-transform: none !important; text-decoration: underline !important;">Abrir perfil</a>
      </article>`;
  }).join("");
}

function renderPulse(animes) {
  const h = [...animes].filter(a => a.controversia > 0 && a.qtdVotos > 1).sort((a,b) => b.controversia - a.controversia).slice(0,5);
  const el = document.getElementById("pulse-card");
  if(el) {
    const groupId = getGroupId();
    el.innerHTML = `
      <span class="eyebrow">Mais controversos</span>
      <h2>Onde a conversa esquenta</h2>
      <div class="hot-list">
        ${h.map(a => {
          const href = `acervo.html#g=${groupId}&open=${a.mal_id}`;
          return `
            <a href="${href}" title="${a.name}">
              <span>${shortText(a.name, 30)}</span>
              <strong>${formatNota(a.controversia)}</strong>
            </a>`;
        }).join("")}
      </div>`;
  }
}

async function init() {
  const data = await loadData();
  _members = data.members;
  const { data: { user } } = await supabase.auth.getUser();
  _currentUser = user;
  renderHero(data);
  renderFeaturedPost(data.animes);
  renderMemberPosts(data.animes, data.members);
  renderPulse(data.animes);
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  fetch(`https://api.jikan.moe/v4/schedules?filter=${days[new Date().getDay()]}`).then(r => r.json()).then(d => {
    const el = document.getElementById("calendar-card");
    if(el) {
      // Filtra e ordena os animes antes de renderizar
      const filteredData = d.data
        .filter(a => a.score && a.score > 6.5 && a.members && a.members > 20000)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

      el.innerHTML = `
        <span class="eyebrow">MAL</span>
        <h2>No ar hoje</h2>
        <div class="calendar-list">
          ${filteredData.map(a => {
            let timeDisplay = "N/A";
            if (a.broadcast?.time) {
              const [h, m] = a.broadcast.time.split(':').map(Number);
              // JST (UTC+9) para BRT (UTC-3) é -12h
              let brH = h - 12;
              if (brH < 0) brH += 24;
              timeDisplay = `${String(brH).padStart(2, '0')}:${String(m).padStart(2, '0')} BR`;
            }
            const score = a.score ? a.score.toFixed(1) : "—";
            return `
              <a class="calendar-item" href="https://myanimelist.net/anime/${a.mal_id}" target="_blank" style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:10px;">
                <div style="display:flex; align-items:center; gap:8px; overflow:hidden; flex:1;">
                  <span class="calendar-dot"></span>
                  <span class="calendar-title" style="font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${shortText(a.title, 22)}</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                  <span style="font-size:9px; color:var(--hacksuya-light); font-weight:800; background:rgba(6,182,212,0.1); padding:2px 6px; border-radius:4px; letter-spacing:0.5px; min-width:55px; text-align:center;">${timeDisplay}</span>
                  <span style="font-size:10px; color:var(--warning); font-weight:800; display:flex; align-items:center; gap:3px; min-width:35px; justify-content:flex-end;">★ ${score}</span>
                </div>
              </a>`;
          }).join("")}
        </div>`;
    }
  });
  const rss = encodeURIComponent("https://news.google.com/rss/search?q=anime&hl=pt-BR&gl=BR");
  fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rss}`).then(r => r.json()).then(d => {
    const el = document.getElementById("news-grid");
    if(el) el.innerHTML = d.items.slice(0,3).map(i => `<article class="news-card"><span class="news-source">${i.author || "News"}</span><h3>${i.title.split(' - ')[0]}</h3><p>${shortText(i.description.replace(/<[^>]*>/g, ""), 120)}</p><a href="${i.link}" target="_blank">Ler mais</a></article>`).join("");
  });
}

window.scrollMemberGrid = (dir) => {
  const g = document.getElementById("member-grid");
  const c = g?.querySelector(".post-card");
  if(g && c) g.scrollBy({ left: dir * (c.offsetWidth + 18), behavior: "smooth" });
};
init().catch(console.error);
