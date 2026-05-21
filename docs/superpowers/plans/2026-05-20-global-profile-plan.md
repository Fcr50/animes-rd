# Global Profile System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a unified user identity system (Global Profile) that centralizes bio, favorites, and openings while supporting group-specific nicknames and colors.

**Architecture:** Database expansion in Supabase, data migration from group levels to global level, and frontend integration using Jikan API and hybrid saving logic.

**Tech Stack:** Supabase (PostgreSQL, JS Client), Vanilla JS, HTML, CSS.

---

### Task 1: Database Migration & Schema Expansion

**Files:**
- Create: `scripts/migrate-global-profiles.js`
- Modify: `sql/schema.sql` (Update documentation)

- [ ] **Step 1: Update schema.sql documentation**
Update the local schema file to reflect the new `profiles` columns and the removal of `openings` from `group_members`.

```sql
-- In sql/schema.sql
ALTER TABLE public.profiles ADD COLUMN nickname text;
ALTER TABLE public.profiles ADD COLUMN color text;
ALTER TABLE public.profiles ADD COLUMN bio text;
ALTER TABLE public.profiles ADD COLUMN avatar_url text;
ALTER TABLE public.profiles ADD COLUMN favorites jsonb DEFAULT '{"animes": [], "openings": []}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN preferences jsonb DEFAULT '{"favorite_genre": "", "vibe": ""}'::jsonb;

-- Note: Remove openings from group_members later in migration script
```

- [ ] **Step 2: Create Migration Script**
Write a Node.js script to add columns and migrate existing data.

```javascript
// scripts/migrate-global-profiles.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
  console.log("Adding columns to profiles...");
  // Note: Run these via SQL editor or RPC if direct ALTER is restricted
  
  console.log("Fetching group members to consolidate openings...");
  const { data: members } = await supabase.from('group_members').select('user_id, openings, nickname, color');
  
  // Group by user_id and pick the most recent (or first)
  const userMap = {};
  members.forEach(m => {
    if (!userMap[m.user_id] || (m.openings && m.openings.length > (userMap[m.user_id].openings?.length || 0))) {
      userMap[m.user_id] = m;
    }
  });

  for (const userId in userMap) {
    const m = userMap[userId];
    await supabase.from('profiles').update({
      nickname: m.nickname,
      color: m.color,
      favorites: { animes: [], openings: m.openings || [] }
    }).eq('id', userId);
  }
  console.log("Migration complete.");
}
migrate();
```

- [ ] **Step 3: Commit migration tools**
```bash
git add sql/schema.sql scripts/migrate-global-profiles.js
git commit -m "feat(db): prepare schema and migration script for global profiles"
```

---

### Task 2: Enhance Account UI (`account.html`)

**Files:**
- Modify: `account.html`

- [ ] **Step 1: Update Openings UI to dual-input**
Replace the single text inputs for openings with Name + URL pairs.

```html
<!-- Inside account.html, #account-favorites-section -->
<div class="opening-field-group">
  <label class="account-v2-field">
    <span>1ª Opening (Nome)</span>
    <input type="text" id="fav-opening-name-1" placeholder="Ex: Again">
  </label>
  <label class="account-v2-field">
    <span>1ª Opening (Link)</span>
    <input type="url" id="fav-opening-url-1" placeholder="https://youtube.com/...">
  </label>
</div>
<!-- Repeat for 2 and 3 -->
```

- [ ] **Step 2: Add Jikan Search Dropdowns for Top Animes**
Add a hidden results container for each of the 3 favorite anime inputs.

```html
<div class="fav-anime-search-wrap">
  <label class="account-v2-field">
    <span>1º anime</span>
    <input type="text" id="fav-anime-input-1" placeholder="Pesquisar anime...">
  </label>
  <div id="fav-anime-results-1" class="search-results-dropdown hidden"></div>
</div>
```

- [ ] **Step 3: Commit UI changes**
```bash
git add account.html
git commit -m "feat(ui): update account page with dual-input openings and search placeholders"
```

---

### Task 3: Implement Profile Logic (`js/account.js`)

**Files:**
- Modify: `js/account.js`

- [ ] **Step 1: Implement Jikan Search for favorites**
Add debounced listeners to `fav-anime-input-X` to fetch and display results.

```javascript
// In js/account.js
async function searchFavAnime(query, index) {
  const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
  const { data } = await response.json();
  renderFavResults(data, index);
}
```

- [ ] **Step 2: Implement Save Logic (The Hybrid Sync)**
Update `account-save-profile` click handler to perform the dual update.

```javascript
// In js/account.js
saveProfileBtn.addEventListener("click", async () => {
  const profileData = {
    nickname: nicknameInput.value,
    bio: bioInput.value,
    color: colorInput.value,
    favorites: {
      animes: getFavAnimesData(), // helper to collect {mal_id, name, img}
      openings: getFavOpeningsData() // helper to collect {name, url}
    }
  };

  await supabase.from('profiles').upsert(profileData);
  
  if (confirm("Deseja atualizar seu nome e cor em TODOS os seus grupos?")) {
    await supabase.from('group_members')
      .update({ nickname: profileData.nickname, color: profileData.color })
      .eq('user_id', currentUser.id);
  }
});
```

- [ ] **Step 3: Commit logic**
```bash
git add js/account.js
git commit -m "feat(logic): implement hybrid saving and jikan search in account page"
```

---

### Task 4: Public Profile Integration (`js/profile.js`)

**Files:**
- Modify: `js/profile.js`

- [ ] **Step 1: Update loadData call and data priority**
Ensure the public profile reads social data from `profiles` but keeps `group_members` for local context.

```javascript
// In js/profile.js -> init()
const { data: profile } = await supabase.from('profiles').select('*').eq('nickname', personNickname).single();
// Use profile.bio and profile.favorites.openings for rendering
```

- [ ] **Step 2: Render Top 3 Posters and Opening Links**
Update `renderHighlights` or add a new section to show the high-quality anime posters from `favorites.animes`.

- [ ] **Step 3: Commit and Finalize**
```bash
git add js/profile.js
git commit -m "feat(profile): integrate global data into public profile view"
```
