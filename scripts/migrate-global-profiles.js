// scripts/migrate-global-profiles.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
  console.log("Adding columns to profiles...");
  // Note: These columns must be added via SQL Editor in Supabase UI first or via RPC.
  
  console.log("Fetching group members to consolidate openings...");
  const { data: members, error: fetchError } = await supabase.from('group_members').select('user_id, openings, nickname, color');
  
  if (fetchError) {
      console.error("Error fetching members:", fetchError.message);
      return;
  }

  if (!members || members.length === 0) {
      console.log("No members found.");
      return;
  }

  // Group by user_id and pick the most recent (or first)
  const userMap = {};
  members.forEach(m => {
    if (!userMap[m.user_id] || (m.openings && m.openings.length > (userMap[m.user_id].openings?.length || 0))) {
      userMap[m.user_id] = m;
    }
  });

  for (const userId in userMap) {
    const m = userMap[userId];
    console.log(`Migrating user ${userId}...`);
    const { error } = await supabase.from('profiles').update({
      nickname: m.nickname,
      color: m.color,
      favorites: { animes: [], openings: m.openings || [] }
    }).eq('id', userId);
    if (error) console.error(`Error migrating user ${userId}:`, error.message);
  }
  console.log("Migration complete.");
}
migrate();
