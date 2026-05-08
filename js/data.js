// js/data.js
import { supabase } from './supabase-client.js';
import { normalizeText, stripEmoji, getGroupId } from "./utils.js";

let _data = null;
let _members = [];

export function invalidateCache() { _data = null; }

// Mapeamento oficial de Gênero Limpo -> Gênero com Emoji
export const PRETTY_GENRES = {
  "Ação": "Ação ⚔️",
  "Aventura": "Aventura 🎒",
  "Comédia": "Comédia 😂",
  "Drama": "Drama 😢",
  "Fantasia": "Fantasia 🧙",
  "Terror": "Terror 👻",
  "Shounen": "Shounen 💥",
  "Mistério": "Mistério 🔍",
  "Romance": "Romance 💖",
  "Ficção Científica": "Ficção Científica 🚀",
  "Slice of Life": "Slice of Life 🍃",
  "Esportes": "Esportes ⚽",
  "Sobrenatural": "Sobrenatural 👻",
  "Psicológico": "Psicológico 🧠",
  "Ecchi": "Ecchi 🔥",
  "Mecha": "Mecha 🤖",
  "Música": "Música 🎵",
  "Histórico": "Histórico 📜",
  "Militar": "Militar 🎖️",
  "Magia": "Magia 🪄",
  "Artes Marciais": "Artes Marciais 🥋",
  "Vampiro": "Vampiro 🧛",
  "Demônios": "Demônios 😈",
  "Escola": "Escola 🏫",
  "Espaço": "Espaço 👨‍🚀",
  "Samurai": "Samurai ⚔️",
  "Policial": "Policial 👮",
  "Harém": "Harém 👫",
  "Jogo": "Jogo 🎮",
  "Paródia": "Paródia 🤡",
  "Isekai": "Isekai 🌍✨",
  "Suspense": "Suspense 😱",
  "Culinária": "Culinária 🍳",
  "Experimental": "Experimental 🧪",
  "Premiado": "Premiado 🏆",
  "BL": "BL 👬",
  "GL": "GL 👭",
  "Hentai": "Hentai 💦",
  "Seinen": "Seinen 👔",
  "Superpoderes": "Superpoderes ⚡",
  "Bomba": "Bomba 💣"
};

export function prettyGenre(name) {
  const clean = stripEmoji(name);
  return PRETTY_GENRES[clean] || name;
}

/**
 * Carrega os membros e animes do grupo atual (Nova Estrutura Normalizada).
 */
export async function loadData() {
  const groupId = getGroupId();
  if (!groupId) return { animes: [], members: [] };

  if (_data && _data.groupId === groupId) return _data;

  // 1. Carregar Membros
  const { data: members, error: membersError } = await supabase
    .from('group_members')
    .select('user_id, nickname, color, role, openings')
    .eq('group_id', groupId);

  if (membersError) throw membersError;
  _members = members;

  // 2. Carregar Instâncias de Animes do Grupo + Metadados Globais + Votos
  const { data: groupAnimes, error: animeError } = await supabase
    .from('group_animes')
    .select(`
      status, 
      links, 
      created_at,
      added_by,
      animes:animes (
        mal_id, 
        name, 
        genres, 
        image_url
      ),
      votes:votes (
        user_id, 
        score, 
        comment
      )
    `)
    .eq('group_id', groupId);

  if (animeError) throw animeError;

  // 3. Processar para manter compatibilidade com o frontend
  const processedAnimes = groupAnimes.map(item => {
    const global = item.animes;
    const votes = item.votes || [];
    
    const scores = votes
      .filter(v => v.score !== null)
      .map(v => Number(v.score));
    
    const avg = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : null;
    const max = scores.length ? Math.max(...scores) : null;
    const min = scores.length ? Math.min(...scores) : null;

    const animeObj = {
      id: global.mal_id, // Usamos mal_id como ID principal no frontend agora
      mal_id: global.mal_id,
      name: global.name,
      genres: global.genres || [],
      image_url: global.image_url,
      status: item.status,
      links: item.links || {},
      created_at: item.created_at,
      added_by: item.added_by,
      
      // Campos calculados
      quemAssistiu: votes.filter(v => v.score !== null).map(v => {
        const member = _members.find(m => m.user_id === v.user_id);
        return member ? member.nickname : 'Desconhecido';
      }),
      qtdVotos: scores.length,
      nota: avg === null ? null : avg.toFixed(1),
      notaSort: avg === null ? 0 : Number(avg.toFixed(2)),
      controversia: scores.length > 1 ? Number((max - min).toFixed(1)) : 0,
      comentarios: votes
        .filter(v => v.comment)
        .map(v => {
          const member = _members.find(m => m.user_id === v.user_id);
          return `${member ? member.nickname : 'Desconhecido'}: ${v.comment}`;
        })
        .join('\n')
    };

    // Notas dinâmicas por nickname (compatibilidade)
    _members.forEach(m => {
      const v = votes.find(v => v.user_id === m.user_id);
      animeObj[`nota${m.nickname}`] = v ? v.score : null;
    });

    return animeObj;
  });

  _data = {
    groupId,
    updatedAt: new Date().toISOString(),
    total: processedAnimes.length,
    animes: processedAnimes,
    members: _members
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
  return Number(nota).toFixed(1);
}

export function personKey(name) {
  return normalizeText(name);
}

export function getPersonNota(anime, personNickname) {
  return anime[`nota${personNickname}`] || null;
}

export function getPersonColor(personNickname) {
  const member = _members.find(m => m.nickname === personNickname);
  return member ? member.color : "#ccc";
}

export function countGenres(animes) {
  const map = {};
  for (const a of animes) {
    for (const g of (a.genres || [])) {
      const p = prettyGenre(g);
      map[p] = (map[p] || 0) + 1;
    }
  }
  return map;
}

export function animesOf(allAnimes, personNickname) {
  return allAnimes.filter((a) => a.quemAssistiu.includes(personNickname));
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
    (a) => a.quemAssistiu.length === 1 && a.quemAssistiu[0] === personNickname
  );
}

export function missedAnimes(animes, personNickname) {
  return animes.filter(
    (a) => !a.quemAssistiu.includes(personNickname) && (a.quemAssistiu || []).length > 0
  );
}

export function topGenres(animes, topN = 10) {
  const map = countGenres(animes);
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
}

export function commonAnimes(animes, p1, p2) {
  return animes.filter(
    (a) => a.quemAssistiu.includes(p1) && a.quemAssistiu.includes(p2)
  );
}

export function cleanGenreLabel(g) {
  return stripEmoji(g);
}
