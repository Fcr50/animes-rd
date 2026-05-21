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
  const projectId = SUPABASE_URL.split('.')[0].replace('https://', '');
  console.log(`🚀 Conectando ao projeto: ${projectId}`);
  console.log("🚀 Iniciando Diagnóstico de Segurança e Dados...");

  try {
    // 0. Verifica se estamos usando a Service Role Key (necessária para bypassar RLS)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError && authError.message.includes("JWTPayloadEnumerator")) {
       console.log("✅ Autenticação: Usando SERVICE_ROLE_KEY (Bypass de RLS ativo)");
    } else {
       console.log("⚠️ Autenticação: O script parece estar usando uma chave comum ou sem permissões de admin.");
    }

    // 1. Diagnóstico: Varredura Total
    console.log("🔍 Fazendo varredura total na tabela group_animes (sem filtros)...");
    const { data: allRows, error: scanError } = await supabase
      .from('group_animes')
      .select('group_id, mal_id, created_at, status');

    if (scanError) {
      console.error("❌ Erro ao acessar a tabela:", scanError.message);
      return;
    }

    console.log(`📊 A tabela group_animes tem ${allRows?.length || 0} linhas no total.`);
    
    if (allRows?.length > 0) {
      const statusCounts = allRows.reduce((acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      }, {});
      console.log("📈 Distribuição de status encontrados no banco:", statusCounts);
    } else {
      console.log("⚠️ ATENÇÃO: O banco de dados para o qual este script aponta está VAZIO.");
      return;
    }

    // 2. Processamento de Limpeza
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    const filteredPending = allRows.filter(a => a.status && String(a.status).toLowerCase() === 'pending');

    if (filteredPending.length === 0) {
      console.log("ℹ️ Nenhum anime com status 'pending' encontrado após varredura total.");
      return;
    }

    console.log(`📊 Encontrados ${filteredPending.length} animes pendentes. Analisando...`);

    for (const item of filteredPending) {
      const { group_id, mal_id, created_at } = item;
      
      if (!group_id || !mal_id) {
          console.warn("⚠️ Pulando item com ID inválido:", item);
          continue;
      }
      
      // Busca o nome apenas para o log
      const { data: animeData } = await supabase.from('animes').select('name').eq('mal_id', mal_id).single();
      const animeName = animeData?.name || `ID:${mal_id}`;

      const isExpired = created_at ? new Date(created_at) < fiveDaysAgo : false;
      console.log(`   - Analisando "${animeName}" (Status: ${item.status}, Criado: ${created_at})`);

      const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', group_id);
      const { data: votes } = await supabase.from('votes').select('user_id').eq('group_id', group_id).eq('mal_id', mal_id);
      
      const votedUserIds = new Set(votes?.map(v => v.user_id));
      const missingMembers = members?.filter(m => !votedUserIds.has(m.user_id)) || [];

      console.log(`     -> Votos: ${votes?.length || 0}/${members?.length || 0}. Faltam: ${missingMembers.length}`);

      if (missingMembers.length === 0) {
        console.log(`     ✅ Votos completos! Aprovando...`);
        const { error: upError } = await supabase.from('group_animes').update({ status: 'approved' }).eq('group_id', group_id).eq('mal_id', mal_id);
        if (upError) console.error("     ❌ Erro ao atualizar status:", upError.message);
        continue;
      }

      if (isExpired) {
        console.log(`     ⏳ Expirou! Votando por ${missingMembers.length} pessoas...`);
        for (const member of missingMembers) {
          const { error: insError } = await supabase.from('votes').insert([{ group_id, mal_id, user_id: member.user_id, score: null, comment: "Voto automático (Expirou 5 dias)" }]);
          if (insError) console.error("     ❌ Erro ao inserir voto:", insError.message);
        }
      }
    }
    console.log("🏁 Fim do processo.");

  } catch (err) {
    console.error("💥 Erro durante a limpeza:", err);
  }
}

runCleanup();
