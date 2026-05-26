// js/utils.js
import { supabase } from "./supabase-client.js";
import { signInWithGoogle, signOut, onAuthStateChange } from "./auth.js";
import { loadData } from "./data.js";

function enforceHttps() {
  const hosts = new Set(["aniliber.com", "www.aniliber.com"]);
  if (window.location.protocol === "http:" && hosts.has(window.location.hostname)) {
    window.location.replace(
      `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
  }
}

enforceHttps();

/**
 * Escapa caracteres HTML para evitar XSS.
 */
export function escapeHTML(value) {
  return String(value == null ? "" : value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
}

/**
 * Normaliza texto (remove acentos e caracteres especiais).
 */
export function normalizeText(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Remove emojis de uma string.
 */
export function stripEmoji(value) {
  return String(value == null ? "" : value)
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2702}-\u{27B0}]/gu, "")
    .trim();
}

/**
 * Converte Hex para RGBA.
 */
export function hexToRgba(hex, alpha = 1) {
  const cleanHex = String(hex).replace("#", "");
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Corta um texto se ele for maior que o limite.
 */
export function shortText(value, size = 44) {
  const text = String(value == null ? "" : value);
  return text.length > size ? `${text.slice(0, size - 1)}...` : text;
}

/**
 * Embaralha um array (Fisher-Yates).
 */
export function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

/**
 * Obtém o ID do grupo da URL (?g=... ou #g=...) ou do localStorage como fallback.
 */
export function getGroupId() {
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));

  let gid = urlParams.get("g") || hashParams.get("g");

  if (gid) {
    localStorage.setItem("active_group_id", gid);
  } else {
    gid = localStorage.getItem("active_group_id");
  }
  return gid;
}

/**
 * Renderiza o botão de Login ou Dashboard no `#user-nav`.
 */
function renderUserNav(user) {
  const userNav = document.getElementById("user-nav");
  if (!userNav) return;

  if (user) {
    const displayName = user.user_metadata?.full_name || user.email || "Meu perfil";
    const avatarUrl = user.user_metadata?.avatar_url || "";
    const fallbackInitial = displayName.trim().charAt(0).toUpperCase() || "U";
    const avatarHtml = avatarUrl
      ? `<img src="${escapeHTML(avatarUrl)}" alt="" width="30" height="30" referrerpolicy="no-referrer" />`
      : `<span>${escapeHTML(fallbackInitial)}</span>`;

    userNav.innerHTML = `
      <a href="index.html" class="nav-btn-link" title="Acessar meu Dashboard">Dashboard</a>
      <div class="nav-profile-menu" data-profile-menu>
        <button class="nav-profile-trigger" type="button" data-profile-trigger aria-label="Abrir menu do perfil" aria-expanded="false">
          <span class="nav-profile-avatar" data-profile-avatar>${avatarHtml}</span>
        </button>
        <div class="nav-profile-dropdown" data-profile-dropdown>
          <a href="account.html" class="nav-profile-item" data-profile-link>Editar perfil</a>
          <button id="btn-logout" class="nav-profile-item nav-profile-logout" type="button">Sair</button>
        </div>
      </div>
    `;
    const profileMenu = userNav.querySelector("[data-profile-menu]");
    const profileTrigger = userNav.querySelector("[data-profile-trigger]");
    profileTrigger?.addEventListener("click", (e) => {
      e.preventDefault();
      const isOpen = profileMenu?.classList.toggle("open");
      profileTrigger.setAttribute("aria-expanded", String(Boolean(isOpen)));
    });
    document.addEventListener("click", (e) => {
      if (!profileMenu?.classList.contains("open")) return;
      if (profileMenu.contains(e.target)) return;
      profileMenu.classList.remove("open");
      profileTrigger?.setAttribute("aria-expanded", "false");
    });

    document.getElementById("btn-logout")?.addEventListener("click", (e) => {
      e.preventDefault();
      // Ao sair, limpamos tudo
      localStorage.removeItem("active_group_id");
      signOut();
    });
  } else {
    userNav.innerHTML = `
      <button id="btn-login" class="nav-btn-action btn-primary">Entrar</button>
    `;
    document.getElementById("btn-login")?.addEventListener("click", (e) => {
      e.preventDefault();
      signInWithGoogle();
    });
  }
}

/**
 * Atualiza o badge de pendências na navbar
 */
export async function updatePendingBadge(user, groupId) {
  if (!user || !groupId) {
    const links = document.querySelectorAll('a[href^="pending.html"]');
    links.forEach(link => {
      let badge = link.querySelector(".nav-badge");
      if (badge) badge.remove();
    });
    return;
  }

  try {
    // 1. Busca TODOS os animes no grupo
    const { data: allAnimes } = await supabase
      .from("group_animes")
      .select("mal_id")
      .eq("group_id", groupId);

    const animeList = allAnimes || [];

    // 2. Busca em quais o usuário já votou
    const { data: userVotes } = await supabase
      .from("votes")
      .select("mal_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id);

    const votedIds = new Set(userVotes?.map((v) => v.mal_id));
    const pendingCount = animeList.filter((a) => !votedIds.has(a.mal_id)).length;

    // 3. Atualiza a UI (Desktop e Mobile)
    const links = document.querySelectorAll('a[href^="pending.html"]');
    links.forEach((link) => {
      let badge = link.querySelector(".nav-badge");
      if (pendingCount > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "nav-badge";
          link.appendChild(badge);
        }
        badge.textContent = pendingCount;
      } else if (badge) {
        badge.remove();
      }
    });
  } catch (err) {
    console.error("Erro ao atualizar badge:", err);
  }
}

/**
 * Atualiza a visibilidade dos itens da navbar baseada no estado de auth e grupo
 */
async function updateNavbarState(user) {
  const nav = document.querySelector("nav.nav");
  if (!nav) return;

  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const isGroupInURL = urlParams.has("g") || hashParams.has("g");
  const groupId = getGroupId();

  // RIGOR: Só mostra se houver usuário LOGADO E grupo na URL
  if (user && isGroupInURL) {
    nav.querySelectorAll(".group-only").forEach((el) => el.classList.remove("group-only"));

    // Atualiza o contador de pendências
    updatePendingBadge(user, groupId);

    // Se logado e em um grupo, carregar membros
    try {
      const data = await loadData();
      const { members, groupName } = data;

      // Exibe o nome do grupo na navbar
      const navGroupName = document.getElementById("nav-group-name");
      if (navGroupName) navGroupName.textContent = groupName;

      const desktopContainer = document.getElementById("nav-person-group-container") || document.getElementById("dynamic-members");
      const mobileContainer = document.getElementById("mobile-dynamic-members");

      const currentUserMember = members.find(m => m.user_id === user.id);
      const otherMembers = members.filter(m => m.user_id !== user.id);

      let membersHtml = '';

      if (currentUserMember) {
        // Render logged-in user as the main visible button
        membersHtml += `
          <div class="nav-dropdown-container">
            <a href="profile.html#g=${groupId}&p=${escapeHTML(currentUserMember.nickname)}" class="nav-link nav-person current-user-btn" style="--nav-pill: ${currentUserMember.color}; --nav-pill-fill: ${currentUserMember.color}33; display: flex; align-items: center;">
              <span class="nav-avatar" style="background:var(--nav-pill-fill); color:var(--nav-pill);">${escapeHTML(currentUserMember.nickname.charAt(0).toUpperCase())}</span>
              ${escapeHTML(currentUserMember.nickname)} <span class="dropdown-caret">▼</span>
            </a>
            <div class="nav-dropdown-menu">
        `;

        // Render other members inside the dropdown
        otherMembers.forEach(m => {
          membersHtml += `
              <a href="profile.html#g=${groupId}&p=${escapeHTML(m.nickname)}" class="nav-link nav-person dropdown-item" style="--nav-pill: ${m.color}; --nav-pill-fill: ${m.color}33;">
                <span class="nav-avatar" style="background:var(--nav-pill-fill); color:var(--nav-pill);">${escapeHTML(m.nickname.charAt(0).toUpperCase())}</span>
                ${escapeHTML(m.nickname)}
              </a>
          `;
        });

        membersHtml += `
            </div>
          </div>
        `;
      } else {
        // Fallback se o usuário não for membro do grupo (admin global, etc)
        membersHtml = members.map(m => `
          <a href="profile.html#g=${groupId}&p=${escapeHTML(m.nickname)}" class="nav-link nav-person" style="--nav-pill: ${m.color}; --nav-pill-fill: ${m.color}33; display: flex; align-items: center;">
            <span class="nav-avatar" style="background:var(--nav-pill-fill); color:var(--nav-pill);">${escapeHTML(m.nickname.charAt(0).toUpperCase())}</span>
            ${escapeHTML(m.nickname)}
          </a>
        `).join("");
      }

      if (desktopContainer) desktopContainer.innerHTML = membersHtml;

      if (mobileContainer) {
        mobileContainer.innerHTML = members.map(m => `
          <a href="profile.html#p=${escapeHTML(m.nickname)}&g=${groupId}">
            <span class="nav-avatar" style="background: ${m.color || '#888'}2e; color: ${m.color || '#888'}">${escapeHTML(m.nickname[0].toUpperCase())}</span>${escapeHTML(m.nickname)}
          </a>
        `).join("");
      }
    } catch (err) {
      console.error("Erro ao carregar membros:", err);
    }
  } else {
    // Caso contrário, garante que tudo do grupo suma
    nav.querySelectorAll("a.nav-link, .nav-person, .mobile-drawer-section").forEach((el) => {
      if (el.getAttribute("href") !== "index.html") {
        el.classList.add("group-only");
      }
    });
  }

  // Atualiza links de TODA A PÁGINA para manter o contexto do grupo
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("#")) return;

    const url = new URL(href, window.location.origin + window.location.pathname);
    const linkPath = url.pathname.split("/").pop() || "index.html";

    // Marca como ativo apenas se for um link da navbar
    if (link.closest("nav.nav")) {
      const isSamePath =
        linkPath === currentPath || (linkPath === "index.html" && currentPath === "");
      let isActive = isSamePath;

      // Refinamento para perfis: checa o parâmetro 'p' (nickname)
      if (currentPath === "profile.html") {
        const linkParams = new URLSearchParams(url.hash.substring(1) || url.search);
        const currentParams = new URLSearchParams(
          window.location.hash.substring(1) || window.location.search,
        );
        if (linkParams.get("p") !== currentParams.get("p")) {
          isActive = false;
        }
      }

      if (isActive) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    }

    // Aplica o contexto de grupo se ele existir
    if (groupId && !href.includes("index.html")) {
      const url = new URL(href, window.location.href);
      if (url.hash) {
        if (!url.hash.includes("g=")) {
          url.hash += `&g=${groupId}`;
        }
      } else {
        url.hash = `g=${groupId}`;
      }
      link.href = url.pathname.split("/").pop() + url.search + url.hash;
    }
  });
}

/**
 * Carrega a navbar dinamicamente.
 */
export async function loadNavbar() {
  const nav = document.querySelector("nav.nav");
  if (!nav) return;

  try {
    const response = await fetch(`navbar.html?v=platform-v18`);
    if (!response.ok) throw new Error("Falha ao carregar navbar.html");

    nav.innerHTML = await response.text();

    onAuthStateChange((event, user) => {
      renderUserNav(user);
      updateNavbarState(user);
    });

    // Mobile Drawer Logic
    const hamburger = nav.querySelector("[data-nav-toggle]");
    const drawer = nav.querySelector("#mobile-drawer");
    const closeBtns = nav.querySelectorAll("[data-nav-close]");

    if (hamburger && drawer) {
      hamburger.addEventListener("click", () => {
        const isExpanded = hamburger.getAttribute("aria-expanded") === "true";
        hamburger.setAttribute("aria-expanded", String(!isExpanded));
        hamburger.classList.toggle("is-open", !isExpanded);
        drawer.setAttribute("aria-hidden", String(isExpanded));
        drawer.classList.toggle("is-open", !isExpanded);
      });

      closeBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          hamburger.setAttribute("aria-expanded", "false");
          hamburger.classList.remove("is-open");
          drawer.setAttribute("aria-hidden", "true");
          drawer.classList.remove("is-open");
        });
      });
    }

    document.dispatchEvent(new CustomEvent("navbar-loaded"));
  } catch (error) {
    console.error("Erro ao carregar a navbar:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadNavbar);
} else {
  loadNavbar();
}
