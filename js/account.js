import { supabase } from "./supabase-client.js";
import { signInWithGoogle } from "./auth.js";

const authGate = document.getElementById("account-auth-gate");
const content = document.getElementById("account-content");
const loginBtn = document.getElementById("account-login-btn");
const avatarUrlInput = document.getElementById("account-avatar-url");
const displayNameInput = document.getElementById("account-display-name");
const nicknameInput = document.getElementById("account-nickname");
const emailInput = document.getElementById("account-email");
const colorInput = document.getElementById("account-color");
const bioInput = document.getElementById("account-bio");
const saveProfileBtn = document.getElementById("account-save-profile");
const statusEl = document.getElementById("account-status");
const cover = document.getElementById("account-cover");
const previewAvatar = document.getElementById("account-preview-avatar");
const largeAvatar = document.getElementById("account-avatar-large");
const previewName = document.getElementById("account-preview-name");
const previewRole = document.getElementById("account-preview-role");
const bioPreview = document.getElementById("account-bio-preview");
const groupsList = document.getElementById("account-groups-list");
const colorButtons = document.querySelectorAll("[data-account-color]");

let selectedAnimes = [null, null, null]; // To store { mal_id, title, image_url }

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char],
  );
}

function initialOf(value) {
  return (value || "A").trim().charAt(0).toUpperCase() || "A";
}

function setAvatar(target, imageUrl, fallback, color) {
  if (!target) return;
  target.style.setProperty("--account-color", color || "#22c55e");
  target.textContent = "";

  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    target.append(img);
    return;
  }

  const initial = document.createElement("span");
  initial.textContent = initialOf(fallback);
  target.append(initial);
}

function updatePreview() {
  const name = displayNameInput?.value || "Seu nome";
  const nick = nicknameInput?.value || "usuario";
  const bio = bioInput?.value.trim() || "Sua biografia aparece aqui como uma prévia pública.";
  const color = colorInput?.value || "#22c55e";
  const avatarUrl = avatarUrlInput?.value.trim() || "";

  document.body.style.setProperty("--account-profile-color", color);
  cover?.style.setProperty("--account-profile-color", color);

  if (previewName) previewName.textContent = name;
  if (previewRole) previewRole.textContent = `@${nick.replace(/^@/, "")}`;
  if (bioPreview) bioPreview.textContent = bio;

  setAvatar(previewAvatar, avatarUrl, name, color);
  setAvatar(largeAvatar, avatarUrl, name, color);

  colorButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.accountColor === color);
  });
}

async function searchFavAnime(query, index) {
  const resultsContainer = document.getElementById(`fav-anime-results-${index}`);
  if (query.length < 3) {
    if (resultsContainer) {
      resultsContainer.innerHTML = "";
      resultsContainer.classList.add("hidden");
    }
    return;
  }
  try {
    const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
    const { data } = await response.json();
    renderFavResults(data, index);
  } catch (err) {
    console.error("Error searching favorite anime:", err);
  }
}

function renderFavResults(data, index) {
  const container = document.getElementById(`fav-anime-results-${index}`);
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="search-result-item">Nenhum resultado encontrado</div>';
  } else {
    container.innerHTML = data.map(anime => `
      <div class="search-result-item" data-id="${anime.mal_id}" data-title="${escapeHTML(anime.title)}" data-image="${anime.images.jpg.image_url}">
        <img src="${anime.images.jpg.small_image_url}" alt="" style="width: 32px; height: 44px; object-fit: cover; border-radius: 4px; margin-right: 8px;">
        <span>${escapeHTML(anime.title)}</span>
      </div>
    `).join("");
  }
  container.classList.remove("hidden");

  container.querySelectorAll(".search-result-item").forEach(item => {
    item.addEventListener("click", () => {
      const animeData = {
        mal_id: item.dataset.id,
        title: item.dataset.title,
        image_url: item.dataset.image
      };
      selectAnime(animeData, index);
    });
  });
}

function selectAnime(anime, index) {
  selectedAnimes[index - 1] = anime;
  const input = document.getElementById(`fav-anime-input-${index}`);
  if (input) input.value = anime.title;
  const container = document.getElementById(`fav-anime-results-${index}`);
  if (container) {
    container.innerHTML = "";
    container.classList.add("hidden");
  }
}

function getFavAnimesData() {
  return selectedAnimes.filter(a => a !== null);
}

function getFavOpeningsData() {
  const openings = [];
  for (let i = 1; i <= 3; i++) {
    const name = document.getElementById(`fav-opening-name-${i}`)?.value.trim();
    const url = document.getElementById(`fav-opening-url-${i}`)?.value.trim();
    if (name || url) {
      openings.push({ name, url });
    }
  }
  return openings;
}

async function loadAccountGroups(user) {
  if (!groupsList || !user) return;

  groupsList.innerHTML = `
    <article class="account-v2-group-card is-loading">
      <strong>Carregando grupos...</strong>
      <span>Buscando participação da sua conta.</span>
    </article>
  `;

  try {
    const { data, error } = await supabase
      .from("group_members")
      .select("group_id, nickname, color, role, groups(id, name, creator_id, invite_code)")
      .eq("user_id", user.id);

    if (error) throw error;

    if (!data?.length) {
      groupsList.innerHTML = `
        <article class="account-v2-group-card is-empty">
          <strong>Nenhum grupo ainda</strong>
          <span>Quando você entrar ou criar um grupo, ele aparece aqui.</span>
        </article>
      `;
      return;
    }

    groupsList.innerHTML = data
      .map((item) => {
        const group = item.groups;
        if (!group) return "";
        const isCreator = group.creator_id === user.id;
        const role = isCreator || item.role === "admin" ? "Admin" : "Membro";
        const color = item.color || "#22c55e";
        return `
          <article class="account-v2-group-card" style="--group-color:${escapeHTML(color)}">
            <div class="account-v2-group-mark">${escapeHTML(group.name.charAt(0).toUpperCase())}</div>
            <div>
              <strong>${escapeHTML(group.name)}</strong>
              <span>${escapeHTML(item.nickname || "Sem apelido")} · ${role}</span>
            </div>
            <a href="acervo.html#g=${encodeURIComponent(group.id)}">Abrir</a>
          </article>
        `;
      })
      .join("");
  } catch (err) {
    console.error("Erro ao carregar grupos do perfil:", err);
    groupsList.innerHTML = `
      <article class="account-v2-group-card is-empty">
        <strong>Não foi possível carregar</strong>
        <span>Tente novamente mais tarde.</span>
      </article>
    `;
  }
}

async function hydrateAccount() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    authGate.hidden = false;
    content.hidden = true;
    return;
  }

  const metadata = user.user_metadata || {};
  const displayName = metadata.full_name || metadata.name || user.email?.split("@")[0] || "Usuário";

  authGate.hidden = true;
  content.hidden = false;

  displayNameInput.value = displayName;
  nicknameInput.value = displayName.split(" ")[0] || "";
  emailInput.value = user.email || "";
  avatarUrlInput.value = metadata.avatar_url || "";
  colorInput.value = "#22c55e";
  bioInput.value = "";

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      if (profile.nickname) nicknameInput.value = profile.nickname;
      if (profile.color) colorInput.value = profile.color;
      if (profile.bio) bioInput.value = profile.bio;
      if (profile.avatar_url) avatarUrlInput.value = profile.avatar_url;

      if (profile.favorites) {
        if (profile.favorites.animes) {
          profile.favorites.animes.forEach((anime, idx) => {
            if (idx < 3) {
              selectedAnimes[idx] = anime;
              const input = document.getElementById(`fav-anime-input-${idx + 1}`);
              if (input) input.value = anime.title;
            }
          });
        }
        if (profile.favorites.openings) {
          profile.favorites.openings.forEach((opening, idx) => {
            if (idx < 3) {
              const nameInput = document.getElementById(`fav-opening-name-${idx + 1}`);
              const urlInput = document.getElementById(`fav-opening-url-${idx + 1}`);
              if (nameInput) nameInput.value = opening.name || "";
              if (urlInput) urlInput.value = opening.url || "";
            }
          });
        }
      }
    }
  } catch (err) {
    console.error("Erro ao hidratar perfil do banco:", err);
  }

  updatePreview();
  loadAccountGroups(user);
}

loginBtn?.addEventListener("click", () => signInWithGoogle());

[avatarUrlInput, displayNameInput, nicknameInput, colorInput, bioInput].forEach((input) => {
  input?.addEventListener("input", updatePreview);
});

for (let i = 1; i <= 3; i++) {
  const animeInput = document.getElementById(`fav-anime-input-${i}`);
  if (animeInput) {
    animeInput.addEventListener("input", debounce((e) => searchFavAnime(e.target.value, i), 500));
  }
}

colorButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!colorInput) return;
    colorInput.value = button.dataset.accountColor || "#22c55e";
    updatePreview();
  });
});

saveProfileBtn?.addEventListener("click", async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  if (!statusEl) return;
  statusEl.textContent = "Salvando...";

  const profileData = {
    id: user.id,
    nickname: nicknameInput.value,
    bio: bioInput.value,
    color: colorInput.value,
    avatar_url: avatarUrlInput.value,
    favorites: {
      animes: getFavAnimesData(),
      openings: getFavOpeningsData()
    }
  };

  try {
    const { error: profileError } = await supabase.from("profiles").upsert(profileData);
    if (profileError) throw profileError;

    if (confirm("Deseja atualizar seu nome e cor em TODOS os seus grupos atuais?")) {
      const { error: syncError } = await supabase.from("group_members")
        .update({ nickname: profileData.nickname, color: profileData.color })
        .eq("user_id", user.id);
      if (syncError) console.error("Erro ao sincronizar grupos:", syncError);
    }

    statusEl.textContent = "Perfil atualizado com sucesso!";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 3000);
  } catch (err) {
    console.error("Erro ao salvar perfil:", err);
    statusEl.textContent = "Erro ao salvar perfil.";
  }
});

hydrateAccount();
