// js/anilist-api.js

const ANILIST_API_URL = "https://graphql.anilist.co";

/**
 * Realiza uma requisição GraphQL para a API do AniList
 */
async function fetchAniListGraphQL(query, variables = {}) {
  const response = await fetch(ANILIST_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`AniList API HTTP Error: ${response.status}`);
  }

  const json = await response.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`AniList GraphQL Error: ${json.errors[0].message}`);
  }

  return json.data;
}

/**
 * Normaliza objeto de anime da AniList para o formato compatível com o AniLiber
 */
function normalizeAniListAnime(media) {
  if (!media) return null;

  const mainTitle = media.title?.english || media.title?.romaji || media.title?.native || "Sem título";

  const titles = [
    { type: "Default", title: mainTitle },
    ...(media.title?.romaji ? [{ type: "Japanese", title: media.title.romaji }] : []),
    ...(media.title?.english ? [{ type: "English", title: media.title.english }] : []),
    ...(media.title?.native ? [{ type: "Native", title: media.title.native }] : []),
  ];

  const largeImg = media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || "";
  const smallImg = media.coverImage?.medium || media.coverImage?.large || "";

  return {
    mal_id: media.idMal || media.id,
    title: mainTitle,
    titles,
    images: {
      jpg: {
        image_url: largeImg,
        large_image_url: largeImg,
        small_image_url: smallImg,
      },
      webp: {
        image_url: largeImg,
        large_image_url: largeImg,
        small_image_url: smallImg,
      },
    },
    genres: (media.genres || []).map((name) => ({ name })),
    year: media.seasonYear || media.startDate?.year || "N/A",
    type: media.format || "Anime",
    local: false,
  };
}

/**
 * Pesquisa animes por termo de busca
 */
export async function searchAnime(query, limit = 5) {
  const gqlQuery = `
    query ($search: String, $perPage: Int) {
      Page(perPage: $perPage) {
        media(search: $search, type: ANIME, isAdult: false) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          coverImage {
            extraLarge
            large
            medium
          }
          genres
          seasonYear
          startDate {
            year
          }
          format
        }
      }
    }
  `;

  const data = await fetchAniListGraphQL(gqlQuery, { search: query, perPage: limit });
  const list = data?.Page?.media || [];
  return list.map(normalizeAniListAnime);
}

/**
 * Busca dados de um anime pelo mal_id (idMal)
 */
export async function fetchAnimeByMalId(malId) {
  const gqlQuery = `
    query ($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        coverImage {
          extraLarge
          large
          medium
        }
        genres
        seasonYear
        startDate {
          year
        }
        format
      }
    }
  `;

  const numericMalId = parseInt(malId, 10);
  if (isNaN(numericMalId)) return null;

  try {
    const data = await fetchAniListGraphQL(gqlQuery, { idMal: numericMalId });
    return normalizeAniListAnime(data?.Media);
  } catch (_err) {
    try {
      const dataFallback = await fetchAniListGraphQL(
        `query ($id: Int) { Media(id: $id, type: ANIME) { id idMal title { romaji english native } coverImage { extraLarge large medium } genres seasonYear startDate { year } format } }`,
        { id: numericMalId }
      );
      return normalizeAniListAnime(dataFallback?.Media);
    } catch {
      return null;
    }
  }
}

/**
 * Busca animes que estão sendo exibidos hoje (Airing Schedules)
 */
export async function fetchTodaySchedules() {
  const now = new Date();
  const startOfDay = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
  const endOfDay = startOfDay + 86400;

  const gqlQuery = `
    query ($airingAtGreater: Int, $airingAtLesser: Int) {
      Page(perPage: 50) {
        airingSchedules(airingAt_greater: $airingAtGreater, airingAt_lesser: $airingAtLesser, sort: TIME_ASC) {
          airingAt
          episode
          media {
            id
            idMal
            title {
              romaji
              english
              native
            }
            averageScore
            popularity
            coverImage {
              large
              extraLarge
            }
            siteUrl
          }
        }
      }
    }
  `;

  const data = await fetchAniListGraphQL(gqlQuery, { airingAtGreater: startOfDay, airingAtLesser: endOfDay });
  const items = data?.Page?.airingSchedules || [];

  return items
    .filter((item) => item.media)
    .map((item) => {
      const media = item.media;
      const title = media.title?.english || media.title?.romaji || media.title?.native || "Sem título";
      const score = media.averageScore ? media.averageScore / 10 : null;
      const malId = media.idMal || media.id;
      const date = new Date(item.airingAt * 1000);
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");

      return {
        mal_id: malId,
        title,
        score,
        popularity: media.popularity || 0,
        airingAt: item.airingAt,
        timeDisplay: `${hours}:${minutes} BR`,
        url: media.siteUrl || `https://myanimelist.net/anime/${malId}`,
        image_url: media.coverImage?.extraLarge || media.coverImage?.large || "",
      };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}
