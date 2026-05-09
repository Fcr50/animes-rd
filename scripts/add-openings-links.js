/**
 * scripts/add-openings-links.js
 * 
 * Padroniza os links de opening para uma busca no YouTube: "Nome do Anime opening 1"
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.migration" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function updateOpeningsToStandardSearch() {
  try {
    const { data: animes, error } = await supabase
      .from('animes')
      .select('id, name, links');

    if (error) throw error;

    let count = 0;
    for (const anime of animes) {
      const currentLinks = anime.links || {};
      
      // Se já tem link de opening, pulamos (ou sobrescrevemos se preferir)
      // Aqui vamos garantir que o campo 'Opening' exista
      const searchQuery = encodeURIComponent(`${anime.name} opening 1`);
      const youtubeLink = `https://www.youtube.com/results?search_query=${searchQuery}`;

      const newLinks = {
        ...currentLinks,
        "Opening 1": youtubeLink
      };

      const { error: updateError } = await supabase
        .from('animes')
        .update({ links: newLinks })
        .eq('id', anime.id);

      if (updateError) {
        continue;
      }
      count++;
    }

  } catch (err) {
    console.error("Erro fatal:", err);
  }
}

updateOpeningsToStandardSearch().catch(console.error);
