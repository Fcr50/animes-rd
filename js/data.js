// js/data.js?v=modal-modal-perf-1 — carrega e processa animes.json

import { normalizeText, stripEmoji } from "./utils.js";

let _data = null;

export async function loadData() {
  if (_data) return _data;
  const res = await fetch("data/animes.json");
  if (!res.ok) throw new Error("Falha ao carregar animes.json");
  _data = await res.json();
  return _data;
}

export function formatNota(nota) {
  if (nota === null || nota === undefined) return "—";
  return Number(nota).toFixed(1);
}

export function personKey(name) {
  return normalizeText(name);
}

export const PEOPLE = ["Rafael", "Fernando", "Dudu", "Hacksuya"];

export const PERSON_COLORS = {
  Rafael: "#7c3aed",
  Fernando: "#ec4899",
  Dudu: "#eab308",
  Hacksuya: "#06b6d4",
};

export const PERSON_LIGHTS = {
  Rafael: "#a78bfa",
  Fernando: "#f9a8d4",
  Dudu: "#fde68a",
  Hacksuya: "#67e8f9",
};

export function getPersonNota(anime, person) {
  if (person === "Rafael") return anime.notaRafael;
  if (person === "Fernando") return anime.notaFernando;
  if (person === "Dudu") return anime.notaDudu;
  if (person === "Hacksuya") return anime.notaHacksuya;
  return null;
}

// Retorna mapa { gênero: count } para um conjunto de animes
export function countGenres(animes) {
  const map = {};
  for (const a of animes) {
    for (const g of a.generos || []) {
      map[g] = (map[g] || 0) + 1;
    }
  }
  return map;
}

// Animes que uma pessoa assistiu
export function animesOf(allAnimes, person) {
  return allAnimes.filter((a) => a.quemAssistiu.includes(person));
}

// Gênero favorito de uma pessoa
export function favoriteGenre(animes, person) {
  const mine = animesOf(animes, person);
  const map = countGenres(mine);
  if (!Object.keys(map).length) return "—";
  return Object.entries(map).sort((a, b) => b[1] - a[1])[0][0];
}

// Anime favorito de uma pessoa (nota mais alta)
export function favoriteAnime(animes, person) {
  const mine = animesOf(animes, person)
    .filter((a) => getPersonNota(a, person) !== null)
    .sort((a, b) => getPersonNota(b, person) - getPersonNota(a, person));
  return mine[0] || null;
}

// Animes exclusivos de uma pessoa (só ela assistiu)
export function exclusiveAnimes(animes, person) {
  return animesOf(animes, person).filter(
    (a) => a.quemAssistiu.length === 1 && a.quemAssistiu[0] === person,
  );
}

// Gêneros ordenados por contagem para um conjunto de animes
export function topGenres(animes, topN = 10) {
  const map = countGenres(animes);
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
}

export function cleanGenreLabel(g) {
  return stripEmoji(g);
}

export function notaColor(nota) {
  if (nota === null || nota === undefined) return "";
  if (nota >= 8.5) return "nota-high";
  if (nota >= 7) return "nota-mid";
  return "nota-low";
}

// Média de notas de uma pessoa
export function avgNota(animes, person) {
  const notes = animesOf(animes, person)
    .map((a) => getPersonNota(a, person))
    .filter((n) => n !== null);
  if (!notes.length) return null;
  return notes.reduce((s, n) => s + n, 0) / notes.length;
}

// Anime mais controverso que uma pessoa avaliou
export function mostControversial(animes, person) {
  const mine = animesOf(animes, person)
    .filter((a) => a.controversia !== null)
    .sort((a, b) => b.controversia - a.controversia);
  return mine[0] || null;
}

// Animes que a pessoa não assistiu mas outros sim
export function missedAnimes(animes, person) {
  return animes.filter((a) => !a.quemAssistiu.includes(person) && a.quemAssistiu.length > 0);
}

// Animes em comum entre duas pessoas
export function commonAnimes(animes, p1, p2) {
  return animes.filter((a) => a.quemAssistiu.includes(p1) && a.quemAssistiu.includes(p2));
}
