/**
 * scripts/migrate-firebase-to-supabase.js
 * 
 * Migra dados do Firebase NoSQL para o novo Supabase Normalizado.
 */

const admin = require("firebase-admin");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.migration" });

// Config Firebase
const serviceAccount = require("./firebase-key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Config Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Erro: Verifique seu arquivo .env.migration");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TARGET_GROUP_ID = "00000000-0000-0000-0000-000000000000"; // Substitua pelo ID do grupo criado no painel

async function migrate() {
  try {
    const snapshot = await db.collection("animes").get();
    
    for (const doc of snapshot.docs) {
      const anime = doc.data();
      const animeName = anime.nome || anime.name;
      const malId = anime.mal_id || null;

      try {
        let animeId;

        // 1. Garante que o anime existe na Biblioteca Global (tabela animes)
        if (malId) {
          const { data: existingGlobal } = await supabase
            .from('animes')
            .select('mal_id')
            .eq('mal_id', malId)
            .maybeSingle();

          if (!existingGlobal) {
            await supabase.from('animes').insert([{
              mal_id: malId,
              name: animeName,
              genres: anime.generos || [],
              image_url: anime.image_url || null
            }]);
          }
        }

        // 2. Cria a instância no grupo (tabela group_animes)
        if (malId) {
           await supabase.from('group_animes').upsert([{
            group_id: TARGET_GROUP_ID,
            mal_id: malId,
            status: anime.status || 'approved',
            links: anime.links || {}
          }]);
        }

        // 3. Migra as notas (tabela legacy_votes ou votes)
        const nicknames = ["Rafael", "Fernando", "Dudu", "Hacksuya", "Zana"];
        for (const nick of nicknames) {
          const score = anime[`nota${nick}`];
          if (score !== undefined && score !== null) {
            await migrateVote(nick, malId, score, anime[`comentario${nick}`] || "");
          }
        }

      } catch (animeError) {
        console.error(`   ❌ Erro ao processar anime:`, animeError.message);
        continue;
      }
    }

  } catch (err) {
    console.error("💥 Erro:", err);
  }
}

async function migrateVote(nickname, malId, score, comment) {
  if (!malId) return;

  // Tenta ver se já existe um usuário com esse nickname no grupo
  const { data: member } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', TARGET_GROUP_ID)
    .eq('nickname', nickname)
    .maybeSingle();

  if (member) {
    // Voto real
    await supabase.from('votes').upsert([{
      group_id: TARGET_GROUP_ID,
      mal_id: malId,
      user_id: member.user_id,
      score: score,
      comment: comment
    }]);
  } else {
    // Voto legado (sala de espera)
    await supabase.from('legacy_votes').insert([{
      group_id: TARGET_GROUP_ID,
      mal_id: malId,
      nickname: nickname,
      score: score,
      comment: comment
    }]);
  }
}

migrate();
