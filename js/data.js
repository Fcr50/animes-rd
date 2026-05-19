// js/data.js
import { supabase } from "./supabase-client.js";
import { normalizeText, stripEmoji, getGroupId } from "./utils.js";

let _data = null;
let _members = [];

const IMAGE_OVERRIDES = {
  49730: "https://myanimelist.net/images/anime/1405/117456l.webp",
};

export function invalidateCache() {
  _data = null;
}

// Mapeamento oficial de Gênero Limpo -> Gênero com Emoji
export const PRETTY_GENRES = {
  Ação: "Ação ⚔️",
  Aventura: "Aventura 🎒",
  Comédia: "Comédia 😂",
  Drama: "Drama 😢",
  Fantasia: "Fantasia 🧙",
  Terror: "Terror 👻",
  Shounen: "Shounen 💥",
  Mistério: "Mistério 🔍",
  Romance: "Romance 💖",
  "Ficção Científica": "Ficção Científica 🚀",
  "Slice of Life": "Slice of Life 🍃",
  Esportes: "Esportes ⚽",
  Sobrenatural: "Sobrenatural 👻",
  Psicológico: "Psicológico 🧠",
  Ecchi: "Ecchi 🔥",
  Mecha: "Mecha 🤖",
  Música: "Música 🎵",
  Histórico: "Histórico 📜",
  Militar: "Militar 🎖️",
  Magia: "Magia 🪄",
  "Artes Marciais": "Artes Marciais 🥋",
  Vampiro: "Vampiro 🧛",
  Demônios: "Demônios 😈",
  Escola: "Escola 🏫",
  Espaço: "Espaço 👨‍🚀",
  Samurai: "Samurai ⚔️",
  Policial: "Policial 👮",
  Harém: "Harém 👫",
  Jogo: "Jogo 🎮",
  Paródia: "Paródia 🤡",
  Isekai: "Isekai 🌍✨",
  Suspense: "Suspense 😱",
  Culinária: "Culinária 🍳",
  Experimental: "Experimental 🧪",
  Premiado: "Premiado 🏆",
  BL: "BL 👬",
  GL: "GL 👭",
  Hentai: "Hentai 💦",
  Seinen: "Seinen 👔",
  Superpoderes: "Superpoderes ⚡",
  Bomba: "Bomba 💣",
};

export function prettyGenre(name) {
  const clean = stripEmoji(name);
  return PRETTY_GENRES[clean] || name;
}

/**
 * Carrega os membros e animes usando a View Otimizada anime_details.
 */
export async function loadData() {
  const groupId = getGroupId();
  if (!groupId) return { animes: [], members: [] };

  if (_data && _data.groupId === groupId) return _data;

  // 1. Carregar Membros
  const { data: members, error: membersError } = await supabase
    .from("group_members")
    .select("user_id, nickname, color, role, openings")
    .eq("group_id", groupId);

  if (membersError) throw membersError;
  _members = members;

  // 2. Carregar tudo da VIEW
  const { data: details, error: detailsError } = await supabase
    .from("anime_details")
    .select("*")
    .eq("group_id", groupId);

  if (detailsError) throw detailsError;

  // 3. Carregar votos brutos para montar a matriz de notas individuais
  const { data: rawVotes } = await supabase
    .from("votes")
    .select("mal_id, user_id, score, comment")
    .eq("group_id", groupId);

  const votesByAnime = {};
  (rawVotes || []).forEach((v) => {
    if (!votesByAnime[v.mal_id]) votesByAnime[v.mal_id] = [];
    votesByAnime[v.mal_id].push(v);
  });

  // 4. Mapeamento final
  const processedAnimes = details.map((item) => {
    const animeVotes = votesByAnime[item.mal_id] || [];

    // Calculamos quemAssistiu diretamente dos votos para máxima precisão
    const quemAssistiu = animeVotes
      .filter((v) => v.score !== null)
      .map((v) => {
        const m = _members.find((member) => member.user_id === v.user_id);
        return m ? m.nickname.trim() : null;
      })
      .filter(Boolean);

    const rawGenres = item.genres || item.generos || [];
    const genresArray = Array.isArray(rawGenres) ? rawGenres : [];

    const animeObj = {
      ...item,
      id: item.mal_id,
      genres: genresArray,
      generos: genresArray, // Compatibilidade duplicada
      image_url: IMAGE_OVERRIDES[item.mal_id] || item.image_url,
      nota: item.nota_media,
      notaSort: Number(item.nota_media) || 0,
      qtdVotos: item.qtd_votos,
      controversia: item.controversia,
      quemAssistiu: quemAssistiu,
      comentarios: animeVotes
        .filter((v) => v.comment)
        .map((v) => {
          const m = _members.find((member) => member.user_id === v.user_id);
          return `${m ? m.nickname : "Desconhecido"}: ${v.comment}`;
        })
        .join("\n"),
    };

    // Preenche as propriedades notaNickname
    _members.forEach((m) => {
      const v = animeVotes.find((v) => v.user_id === m.user_id);
      animeObj[`nota${m.nickname}`] = v ? v.score : null;
    });

    return animeObj;
  });

  const approvedAnimes = processedAnimes.filter((a) => a.status === "approved");

  _data = {
    groupId,
    updatedAt: new Date().toISOString(),
    total: approvedAnimes.length,
    animes: approvedAnimes,
    members: _members,
  };

  return _data;
}

export function notaColor(nota) {
  if (nota === null || nota === undefined) return "";
  if (nota >= 8.5) return "nota-high";
  if (nota >= 7) return "nota-mid";
  return "nota-low";
}

export function formatNota(nota) {
  if (nota === null || nota === undefined) return "—";
  return Number(nota).toFixed(2);
}

export function personKey(name) {
  return normalizeText(name);
}

export function getPersonNota(anime, personNickname) {
  return anime[`nota${personNickname}`] || null;
}

export function getPersonColor(personNickname) {
  const member = _members.find((m) => m.nickname === personNickname);
  return member ? member.color : "#ccc";
}

export function countGenres(animes) {
  const map = {};
  for (const a of animes) {
    for (const g of a.genres || []) {
      const p = prettyGenre(g);
      map[p] = (map[p] || 0) + 1;
    }
  }
  return map;
}

export function animesOf(allAnimes, personNickname) {
  return allAnimes.filter((a) => (a.quemAssistiu || []).includes(personNickname));
}

export function favoriteGenre(animes, personNickname) {
  const mine = animesOf(animes, personNickname);
  const map = countGenres(mine);
  if (!Object.keys(map).length) return "—";
  return Object.entries(map).sort((a, b) => b[1] - a[1])[0][0];
}

export function avgNota(animes, personNickname) {
  const notes = animesOf(animes, personNickname)
    .map((a) => getPersonNota(a, personNickname))
    .filter((n) => n !== null);
  if (!notes.length) return null;
  return notes.reduce((s, n) => s + n, 0) / notes.length;
}

export function favoriteAnime(animes, personNickname) {
  const mine = animesOf(animes, personNickname)
    .filter((a) => getPersonNota(a, personNickname) !== null)
    .sort((a, b) => getPersonNota(b, personNickname) - getPersonNota(a, personNickname));
  return mine[0] || null;
}

export function mostControversial(animes, personNickname) {
  const mine = animesOf(animes, personNickname)
    .filter((a) => a.controversia !== null)
    .sort((a, b) => b.controversia - a.controversia);
  return mine[0] || null;
}

export function exclusiveAnimes(animes, personNickname) {
  return animesOf(animes, personNickname).filter(
    (a) => (a.quemAssistiu || []).length === 1 && a.quemAssistiu[0] === personNickname,
  );
}

export function missedAnimes(animes, personNickname) {
  return animes.filter(
    (a) => !(a.quemAssistiu || []).includes(personNickname) && (a.quemAssistiu || []).length > 0,
  );
}

export function topGenres(animes, topN = 10) {
  const map = countGenres(animes);
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
}

export function commonAnimes(animes, p1, p2) {
  if (!p1 || !p2) return [];
  const nick1 = p1.trim().toLowerCase();
  const nick2 = p2.trim().toLowerCase();

  return animes.filter((a) => {
    const watchers = (a.quemAssistiu || []).map((w) => w.toLowerCase());
    return watchers.includes(nick1) && watchers.includes(nick2);
  });
}

export function cleanGenreLabel(g) {
  return stripEmoji(g);
}
