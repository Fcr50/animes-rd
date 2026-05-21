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
  try {
    // 1. Buscar animes pendentes há mais de 5 dias OU que já tenham votos suficientes
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const { data: allPending, error: animeError } = await supabase
      .from('group_animes')
      .select('group_id, mal_id, created_at, animes(name)')
      .eq('status', 'pending');

    if (animeError) throw animeError;

    if (!allPending || allPending.length === 0) {
      console.log("Nenhum anime pendente encontrado.");
      return;
    }

    console.log(`Analisando ${allPending.length} animes pendentes...`);

    for (const item of allPending) {
      const { group_id, mal_id, created_at } = item;
      const isExpired = new Date(created_at) < fiveDaysAgo;

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

      // LÓGICA A: Se já tem votos de todos os membros atuais (ex: membro expulso), aprova direto
      if (missingMembers.length === 0) {
        console.log(`   ✅ Forçando aprovação de "${item.animes?.name}" (Votos completos)`);
        await supabase.from('group_animes').update({ status: 'approved' }).eq('group_id', group_id).eq('mal_id', mal_id);
        continue;
      }

      // LÓGICA B: Se expirou os 5 dias, vota automaticamente pelos faltantes
      if (isExpired) {
        console.log(`   ⏳ Expirou 5 dias para "${item.animes?.name}". Votando por ${missingMembers.length} pessoas...`);
        for (const member of missingMembers) {
          await supabase.from('votes').insert([{
            group_id: group_id,
            mal_id: mal_id,
            user_id: member.user_id,
            score: null,
            comment: "Voto automático (Sistema: Expirou 5 dias)"
          }]);
        }
        // O Trigger do banco cuidará de mudar para 'approved' após os inserts acima
      }
    }

  } catch (err) {
    console.error("💥 Erro durante a limpeza:", err);
  }
}

runCleanup();
