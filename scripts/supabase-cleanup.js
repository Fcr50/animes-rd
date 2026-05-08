/**
 * scripts/supabase-cleanup.js
 * 
 * Regra dos 5 dias:
 * Busca animes pendentes há mais de 5 dias e vota "Não Assisti" 
 * automaticamente para quem esqueceu, disparando a aprovação automática.
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.migration" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Erro: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar no .env.migration");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runCleanup() {
  console.log("🤖 Iniciando faxina automática (Regra dos 5 dias)...");

  try {
    // 1. Buscar animes pendentes há mais de 5 dias
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const { data: pendingAnimes, error: animeError } = await supabase
      .from('group_animes')
      .select('group_id, mal_id, created_at, animes(name)')
      .eq('status', 'pending')
      .lt('created_at', fiveDaysAgo.toISOString());

    if (animeError) throw animeError;

    if (!pendingAnimes || pendingAnimes.length === 0) {
      console.log("✅ Nenhum anime pendente expirado encontrado.");
      return;
    }

    console.log(`📦 Encontrados ${pendingAnimes.length} animes aguardando decisão...`);

    for (const item of pendingAnimes) {
      const { group_id, mal_id } = item;
      const animeName = item.animes?.name || 'Desconhecido';

      console.log(`\n🔹 Processando: ${animeName} (Grupo: ${group_id})`);

      // 2. Buscar todos os membros desse grupo
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', group_id);

      // 3. Buscar quem já votou nesse anime
      const { data: votes } = await supabase
        .from('votes')
        .select('user_id')
        .eq('group_id', group_id)
        .eq('mal_id', mal_id);

      const votedUserIds = new Set(votes?.map(v => v.user_id));
      const missingMembers = members?.filter(m => !votedUserIds.has(m.user_id));

      if (!missingMembers || missingMembers.length === 0) {
        console.log(`   ℹ️ Todos já votaram, mas o status ainda é pending. O trigger deve resolver.`);
        continue;
      }

      console.log(`   ⏳ Faltam ${missingMembers.length} votos. Inserindo votos automáticos...`);

      // 4. Inserir votos "Não Assisti" para os membros faltantes
      for (const member of missingMembers) {
        const { error: voteError } = await supabase
          .from('votes')
          .insert([{
            group_id: group_id,
            mal_id: mal_id,
            user_id: member.user_id,
            score: null, // "Não Assisti"
            comment: "Voto automático (Sistema: Expirou 5 dias)"
          }]);

        if (voteError) {
          console.error(`   ❌ Erro ao votar para ${member.user_id}:`, voteError.message);
        } else {
          console.log(`   ✅ Voto automático inserido para o usuário ${member.user_id.substring(0,8)}...`);
        }
      }
    }

    console.log("\n✨ Faxina concluída!");

  } catch (err) {
    console.error("💥 Erro durante a limpeza:", err);
  }
}

runCleanup();
