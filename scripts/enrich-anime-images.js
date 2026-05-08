/**
 * scripts/enrich-anime-images.js
 * 
 * Busca animes com image_url nula e popula via API do Jikan.
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env" });
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Erro: Credenciais faltando no .env.migration");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function enrich() {
  console.log("🖼️ Iniciando busca de imagens para o acervo...");

  try {
    // 1. Pegar animes sem imagem
    const { data: animes, error } = await supabase
      .from('animes')
      .select('mal_id, name')
      .is('image_url', null)
      .not('mal_id', 'is', null);

    if (error) throw error;

    if (!animes || animes.length === 0) {
      console.log("✅ Todos os animes já possuem imagem!");
      return;
    }

    console.log(`📦 Encontrados ${animes.length} animes para atualizar.`);

    for (const anime of animes) {
      console.log(`\n🔍 Buscando imagem para: ${anime.name} (ID: ${anime.mal_id})`);

      try {
        const res = await fetch(`https://api.jikan.moe/v4/anime/${anime.mal_id}`);
        
        if (res.status === 429) {
          console.warn("⚠️ Rate limit atingido. Aguardando 5 segundos...");
          await new Promise(r => setTimeout(r, 5000));
          continue; 
        }

        if (!res.ok) {
          console.error(`❌ Erro API Jikan para ${anime.name}: ${res.status}`);
          continue;
        }

        const payload = await res.json();
        const imageUrl = payload.data?.images?.webp?.large_image_url || payload.data?.images?.jpg?.large_image_url;

        if (imageUrl) {
          const { error: updateError } = await supabase
            .from('animes')
            .update({ image_url: imageUrl })
            .eq('mal_id', anime.mal_id);

          if (updateError) console.error(`   ❌ Erro ao salvar no banco:`, updateError.message);
          else console.log(`   ✅ Imagem salva: ${imageUrl.substring(0, 40)}...`);
        } else {
          console.log(`   ⚠️ Nenhuma imagem encontrada para este ID.`);
        }

        // Aguarda 1 segundo entre as chamadas para respeitar o Jikan (3 req/sec)
        await new Promise(r => setTimeout(r, 1000));

      } catch (err) {
        console.error(`   💥 Erro no processamento de ${anime.name}:`, err.message);
      }
    }

    console.log("\n✨ Processo de imagens concluído!");

  } catch (err) {
    console.error("💥 Erro catastrófico:", err);
  }
}

enrich();
