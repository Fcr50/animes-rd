// scripts/add-anime-titles.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function addTitlesColumn() {
  console.log("Verificando se a coluna 'titles' já existe...");
  try {
    const { error } = await supabase.rpc('execute_sql', {
      sql: 'ALTER TABLE public.animes ADD COLUMN titles jsonb'
    });
    if (error && !error.message.includes('column "titles" of relation "animes" already exists')) {
      throw error;
    }
    if (!error) {
        console.log("Coluna 'titles' adicionada com sucesso!");
    } else {
        console.log("Coluna 'titles' já existe. Ignorando a criação.");
    }
  } catch (err) {
    console.error("Erro ao tentar adicionar a coluna:", err.message);
    console.log("Pode ser que a coluna já exista, o que não é um problema. O script tentará continuar.");
  }
}

async function backfillAnimeTitles() {
  console.log('Buscando todos os animes do banco de dados que ainda não têm títulos...');
  
  const { data: animes, error } = await supabase
    .from('animes')
    .select('mal_id, name')
    .or('titles.is.null,titles.eq.[]');

  if (error) {
    console.error('Erro ao buscar animes:', error.message);
    return;
  }

  if (!animes.length) {
    console.log('Nenhum anime para atualizar. Todos já possuem títulos.');
    return;
  }

  console.log(`Encontrados ${animes.length} animes para atualizar. Iniciando o processo...`);
  console.log('Isso pode levar vários minutos. A API do Jikan tem um limite de requisições.');

  for (let i = 0; i < animes.length; i++) {
    const anime = animes[i];
    const { mal_id, name } = anime;

    try {
      await new Promise(resolve => setTimeout(resolve, 500)); 

      console.log(`[${i + 1}/${animes.length}] Buscando títulos para: ${name} (ID: ${mal_id})`);

      const response = await fetch(`https://api.jikan.moe/v4/anime/${mal_id}/full`);
      if (!response.ok) {
        console.warn(`  -> Falha ao buscar dados para o ID ${mal_id}. Status: ${response.status}. Pulando.`);
        continue;
      }
      
      const { data: apiData } = await response.json();
      const titles = apiData.titles || [];

      if (titles.length > 0) {
        const { error: updateError } = await supabase
          .from('animes')
          .update({ titles: titles })
          .eq('mal_id', mal_id);

        if (updateError) {
          console.error(`  -> Erro ao atualizar o anime ${name}:`, updateError.message);
        } else {
          console.log(`  -> Títulos para "${name}" atualizados com sucesso.`);
        }
      } else {
        console.log(`  -> Nenhum título alternativo encontrado para "${name}". Pulando.`);
      }

    } catch (e) {
      console.error(`  -> Erro inesperado no processamento do anime ${name}:`, e.message);
    }
  }

  console.log('Processo de atualização concluído!');
}

async function run() {
  await addTitlesColumn();
  await backfillAnimeTitles();
}

run().catch(console.error);
