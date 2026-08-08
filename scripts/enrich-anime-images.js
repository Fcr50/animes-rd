/**
 * scripts/enrich-anime-images.js
 * 
 * Busca animes com image_url nula e popula via API do Jikan.
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.migration" });
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Erro: Credenciais faltando no .env.migration");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function enrich() {
  try {
    // 1. Pegar animes sem imagem
    const { data: animes, error } = await supabase
      .from('animes')
      .select('mal_id, name')
      .is('image_url', null)
      .not('mal_id', 'is', null);

    if (error) throw error;

    if (!animes || animes.length === 0) {
      return;
    }

    for (const anime of animes) {
      try {
        const query = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { coverImage { extraLarge large medium } } }`;
        const res = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query, variables: { idMal: parseInt(anime.mal_id, 10) } }),
        });
        
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, 5000));
          continue; 
        }

        if (!res.ok) {
          continue;
        }

        const payload = await res.json();
        const media = payload.data?.Media;
        const imageUrl = media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium;

        if (imageUrl) {
          const { error: updateError } = await supabase
            .from('animes')
            .update({ image_url: imageUrl })
            .eq('mal_id', anime.mal_id);

          if (updateError) console.error(`   ❌ Erro ao salvar no banco:`, updateError.message);
        }

        // Aguarda 300ms entre as chamadas (AniList rate limit: 90 req/min)
        await new Promise(r => setTimeout(r, 300));

      } catch (err) {
        console.error(`   💥 Erro no processamento de ${anime.name}:`, err.message);
      }
    }

  } catch (err) {
    console.error("💥 Erro catastrófico:", err);
  }
}

enrich();
