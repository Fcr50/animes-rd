/**
 * scripts/supabase-cleanup.js
 * 
 * Regra dos 5 dias:
 * Busca animes pendentes há mais de 5 dias e vota "Não Assisti" 
 * automaticamente para quem esqueceu, disparando a aprovação automática.
 */

const { createClient } = require("@supabase/supabase-js");

// Tenta carregar o .env apenas se o arquivo existir (útil para dev local)
try {
  require("dotenv").config();
} catch (e) {
  // No GitHub Actions, as variáveis vêm dos Secrets, então o dotenv pode falhar sem problemas
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Erro: Variáveis de ambiente SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontradas.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runCleanup() {
  console.log("🚀 Iniciando processo de limpeza...");
  try {
    // 1. Buscar animes pendentes há mais de 5 dias OU que já tenham votos suficientes
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    console.log(`🔍 Buscando animes com status 'pending'...`);
    
    const { data: allPending, error: animeError } = await supabase
      .from('group_animes')
      .select('group_id, mal_id, created_at')
      .eq('status', 'pending');

    if (animeError) {
      console.error("❌ Erro na query do Supabase:", animeError.message);
      console.error("Detalhes:", animeError);
      return;
    }

    if (!allPending || allPending.length === 0) {
      console.log("ℹ️ Nenhuma linha encontrada na tabela group_animes com status 'pending'.");
      return;
    }

    console.log(`📊 Encontrados ${allPending.length} animes pendentes no total. Analisando cada um...`);

    for (const item of allPending) {
      const { group_id, mal_id, created_at } = item;
      
      // Busca o nome apenas para o log, para não quebrar a query principal
      const { data: animeData } = await supabase.from('animes').select('name').eq('mal_id', mal_id).single();
      const animeName = animeData?.name || `ID:${mal_id}`;

      const isExpired = new Date(created_at) < fiveDaysAgo;
      console.log(`   - Analisando "${animeName}" (Criado em: ${created_at}, Expirado: ${isExpired})`);

      // 2. Buscar todos os membros ATUAIS desse grupo
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
      const missingMembers = members?.filter(m => !votedUserIds.has(m.user_id)) || [];

      console.log(`     -> Votos: ${votes?.length || 0} | Membros no grupo: ${members?.length || 0} | Faltam: ${missingMembers.length}`);

      // LÓGICA A: Se já tem votos de todos os membros atuais, aprova
      if (missingMembers.length === 0) {
        console.log(`     ✅ Votos completos! Forçando aprovação...`);
        const { error: upError } = await supabase.from('group_animes').update({ status: 'approved' }).eq('group_id', group_id).eq('mal_id', mal_id);
        if (upError) console.error(`     ❌ Erro ao aprovar:`, upError.message);
        continue;
      }

      // LÓGICA B: Se expirou os 5 dias, vota automaticamente
      if (isExpired) {
        console.log(`     ⏳ Tempo expirado! Inserindo ${missingMembers.length} votos automáticos...`);
        for (const member of missingMembers) {
          const { error: insError } = await supabase.from('votes').insert([{
            group_id: group_id,
            mal_id: mal_id,
            user_id: member.user_id,
            score: null,
            comment: "Voto automático (Sistema: Expirou 5 dias)"
          }]);
          if (insError) console.error(`     ❌ Erro no voto automático:`, insError.message);
        }
      }
    }

    console.log("🏁 Fim do processo de limpeza.");

  } catch (err) {
    console.error("💥 Erro durante a limpeza:", err);
  }
}

runCleanup();
