/**
 * scripts/migrate-firebase-to-supabase.js (CORRIGIDO)
 */

const admin = require("firebase-admin");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env" });

const FIREBASE_SERVICE_ACCOUNT = require("./serviceAccountKey.json");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TARGET_GROUP_ID) {
  console.error("Erro: Verifique seu arquivo .env.migration");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(FIREBASE_SERVICE_ACCOUNT) });
const firestore = admin.firestore();
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const PEOPLE = ["Rafael", "Fernando", "Dudu", "Hacksuya", "Zana"];

async function migrate() {
  console.log("🚀 Iniciando migração corrigida...");

  try {
    // 1. Mapear membros atuais
    const { data: currentMembers } = await supabase
      .from('group_members')
      .select('user_id, nickname')
      .eq('group_id', TARGET_GROUP_ID);

    const memberMap = {};
    currentMembers?.forEach(m => memberMap[m.nickname] = m.user_id);

    // 2. Buscar animes do Firebase
    const approvedSnapshot = await firestore.collection("animes").get();
    const pendingSnapshot = await firestore.collection("pending_animes").get();
    const allDocs = [
      ...approvedSnapshot.docs.map(d => ({ ...d.data(), status: 'approved' })), 
      ...pendingSnapshot.docs.map(d => ({ ...d.data(), status: 'pending' }))
    ];

    for (const data of allDocs) {
      const animeName = data.nome || data.name;
      console.log(`\n🔹 Processando: ${animeName}`);

      // 3. Upsert do Anime (Se já existir pelo nome no grupo, ele pega o ID existente)
      const { data: existingAnime } = await supabase
        .from('animes')
        .select('id')
        .eq('name', animeName)
        .eq('group_id', TARGET_GROUP_ID)
        .maybeSingle();

      let animeId;
      if (existingAnime) {
        animeId = existingAnime.id;
        console.log(`   ℹ️ Anime já existe no Supabase (ID: ${animeId})`);
      } else {
        const links = {};
        if (data.files) data.files.forEach(f => links[f.name || 'Link'] = f.url);

        const { data: newAnime, error: animeError } = await supabase
          .from('animes')
          .insert([{
            group_id: TARGET_GROUP_ID,
            name: animeName,
            mal_id: data.malId || null,
            genres: data.generos || [],
            links: links,
            status: data.status || 'pending'
          }])
          .select().single();

        if (animeError) {
          console.error(`   ❌ Erro ao criar anime:`, animeError.message);
          continue;
        }
        animeId = newAnime.id;
      }

      // 4. Processar Votos
      for (const person of PEOPLE) {
        let score = data[`nota${person}`];
        let comment = "";

        // Tenta pegar comentário estruturado
        if (data.comments) {
          const c = data.comments.find(c => c.person === person);
          if (c) comment = c.text;
        }

        // Se for pendente no Firebase
        if (data.votes && data.votes[person]) {
          score = data.votes[person].score;
          comment = data.votes[person].comment;
        }

        if (score !== undefined && score !== null) {
          await insertVote(animeId, animeName, person, score, comment, memberMap);
        }
      }
    }

    console.log("\n✅ Migração concluída com sucesso!");

  } catch (err) {
    console.error("💥 Erro:", err);
  }
}

async function insertVote(animeId, animeName, nickname, score, comment, memberMap) {
  const userId = memberMap[nickname];

  if (userId) {
    // Voto real (para você, Dudu)
    const { error } = await supabase.from('votes').upsert([{
      anime_id: animeId,
      user_id: userId,
      score: score,
      comment: comment || null
    }], { onConflict: 'anime_id, user_id' });
    
    if (!error) console.log(`   ✅ Voto real: ${nickname}`);
  } else {
    // Voto legado (Rafael, Fernando, etc) - CORRIGIDO NOME DA COLUNA
    const { error } = await supabase.from('legacy_votes').insert([{
      anime_id: animeId,
      anime_name: animeName,
      group_id: TARGET_GROUP_ID,
      nickname: nickname,
      score: score,
      comment: comment || null
    }]);

    if (error) {
      console.error(`   ❌ Erro na nota de ${nickname}:`, error.message);
    } else {
      console.log(`   ⏳ Nota guardada: ${nickname}`);
    }
  }
}

migrate();
