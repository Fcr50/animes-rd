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
const cover = document.getElementById("account-cover");
const previewAvatar = document.getElementById("account-preview-avatar");
const largeAvatar = document.getElementById("account-avatar-large");
const previewName = document.getElementById("account-preview-name");
const previewRole = document.getElementById("account-preview-role");
const bioPreview = document.getElementById("account-bio-preview");
const colorLabel = document.getElementById("account-color-label");
const colorButtons = document.querySelectorAll("[data-account-color]");

const COLOR_NAMES = {
  "#06b6d4": "Ciano",
  "#22c55e": "Verde AniLiber",
  "#8b5cf6": "Roxo",
  "#f472b6": "Rosa",
  "#f59e0b": "Dourado",
};

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
  if (colorLabel) colorLabel.textContent = COLOR_NAMES[color.toLowerCase()] || color.toUpperCase();

  setAvatar(previewAvatar, avatarUrl, name, color);
  setAvatar(largeAvatar, avatarUrl, name, color);

  colorButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.accountColor === color);
  });
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

  updatePreview();
}

loginBtn?.addEventListener("click", () => signInWithGoogle());

[avatarUrlInput, displayNameInput, nicknameInput, colorInput, bioInput].forEach((input) => {
  input?.addEventListener("input", updatePreview);
});

colorButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!colorInput) return;
    colorInput.value = button.dataset.accountColor || "#22c55e";
    updatePreview();
  });
});

hydrateAccount();
