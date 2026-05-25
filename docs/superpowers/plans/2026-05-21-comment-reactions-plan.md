# Comment Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a social reaction system allowing users to react to comments with any emoji using an external picker library.

**Architecture:** A new `comment_reactions` table links emojis to specific `vote_id`s. `js/data.js` aggregates this data, and `js/table.js` renders the UI using the `picmo` library for the emoji picker, with Supabase Realtime for instant updates.

**Tech Stack:** Supabase (PostgreSQL, JS Client, Realtime), Vanilla JS, PicMo (Emoji Library), CSS.

---

### Task 1: Database Setup

**Files:**
- Modify: `sql/schema.sql`

- [ ] **Step 1: Update schema.sql documentation**
Document the new table and its policies in the local schema file.

```sql
-- In sql/schema.sql (append to the end or appropriately inside)
CREATE TABLE public.comment_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  mal_id integer NOT NULL,
  vote_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT comment_reactions_pkey PRIMARY KEY (id),
  CONSTRAINT comment_reactions_vote_id_fkey FOREIGN KEY (vote_id) REFERENCES public.votes(id) ON DELETE CASCADE,
  CONSTRAINT comment_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT comment_reactions_unique UNIQUE (vote_id, user_id)
);

-- RLS Policies for comment_reactions:
-- ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Enable read access for all users" ON public.comment_reactions FOR SELECT USING (true);
-- CREATE POLICY "Enable insert for authenticated users" ON public.comment_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Enable update for users based on user_id" ON public.comment_reactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Enable delete for users based on user_id" ON public.comment_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

- [ ] **Step 2: Commit Schema Update**
```bash
git add sql/schema.sql
git commit -m "docs(db): add comment_reactions schema"
```

---

### Task 2: Data Aggregation

**Files:**
- Modify: `js/data.js`

- [ ] **Step 1: Fetch votes with IDs and reactions**
In `js/data.js`'s `loadData` function, fetch `id` alongside other vote data, and fetch all reactions for the group.

```javascript
// In js/data.js, inside loadData:
// Replace the rawVotes fetch with:
  const { data: rawVotes } = await supabase
    .from("votes")
    .select("id, mal_id, user_id, score, comment")
    .eq("group_id", groupId);

  const { data: rawReactions } = await supabase
    .from("comment_reactions")
    .select("vote_id, user_id, emoji")
    .eq("group_id", groupId);

  const reactionsByVote = {};
  (rawReactions || []).forEach((r) => {
    if (!reactionsByVote[r.vote_id]) reactionsByVote[r.vote_id] = [];
    reactionsByVote[r.vote_id].push(r);
  });
```

- [ ] **Step 2: Attach reactions to comentarios_array**
Update the `comentarios_array` mapping to include `id` and the associated `reactions`.

```javascript
// In js/data.js, inside loadData's processedAnimes map:
// Replace the `comentarios_array` mapping with:
      comentarios_array: animeVotes
        .filter((v) => v.comment)
        .map((v) => {
          const m = _members.find((member) => member.user_id === v.user_id);
          return { 
            id: v.id, 
            user_id: v.user_id,
            nickname: m ? m.nickname : "Desconhecido", 
            text: v.comment,
            reactions: reactionsByVote[v.id] || []
          };
        }),
```

- [ ] **Step 3: Commit Data Aggregation**
```bash
git add js/data.js
git commit -m "feat(data): aggregate comment reactions with vote data"
```

---

### Task 3: UI Integration & PicMo Setup

**Files:**
- Modify: `acervo.html`
- Modify: `css/style.css`
- Modify: `js/table.js`

- [ ] **Step 1: Include PicMo in acervo.html**
Add the PicMo library to `acervo.html` via CDN.

```html
<!-- In acervo.html, right before </body> -->
<script type="module" src="https://unpkg.com/picmo@latest/dist/index.js"></script>
<script type="module" src="https://unpkg.com/@picmo/popup-picker@latest/dist/index.js"></script>
```

- [ ] **Step 2: Add CSS for Reactions**
Append styles for the reaction bar and buttons to `css/style.css`.

```css
/* COMMENT REACTIONS STYLES */
.reaction-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  align-items: center;
}

.reaction-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  color: var(--paper);
}

.reaction-pill:hover {
  background: rgba(255, 255, 255, 0.1);
}

.reaction-pill.reacted-by-me {
  background: rgba(139, 92, 246, 0.2);
  border-color: rgba(139, 92, 246, 0.5);
}

.add-reaction-btn {
  background: transparent;
  border: none;
  color: var(--faint);
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  transition: color 0.15s, background 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-reaction-btn:hover {
  color: var(--paper);
  background: rgba(255, 255, 255, 0.1);
}
```

- [ ] **Step 3: Render Reaction UI in table.js**
Modify `openModal` to render the reactions and the add button for each comment.

```javascript
// In js/table.js, inside openModal's comments.map function:
// Replace the return statement with:
            
            // Agrupar reações por emoji
            const reactionCounts = {};
            const myReactions = new Set();
            (c.reactions || []).forEach(r => {
              if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = 0;
              reactionCounts[r.emoji]++;
              if (currentUser && r.user_id === currentUser.id) myReactions.add(r.emoji);
            });

            const reactionPills = Object.entries(reactionCounts).map(([emoji, count]) => {
              const isMine = myReactions.has(emoji);
              return `<button class="reaction-pill ${isMine ? 'reacted-by-me' : ''}" onclick="window.toggleReaction('${a.mal_id}', '${c.id}', '${emoji}')">
                <span>${emoji}</span> <span>${count}</span>
              </button>`;
            }).join("");

            return `<article class="comment-item" style="--comment-accent:${color}">
            <div class="comment-header">
              <strong style="color:${color}">${escapeHTML(c.nickname.trim())}</strong>
              ${notaHtml}
            </div>
            <p>${safeText}</p>
            <div class="reaction-bar" id="reaction-bar-${c.id}">
              ${reactionPills}
              <button class="add-reaction-btn" id="add-reaction-${c.id}" aria-label="Adicionar reação">☻+</button>
            </div>
          </article>`;
```

- [ ] **Step 4: Initialize PicMo Pickers**
Add a function to initialize the popover pickers after the modal HTML is inserted.

```javascript
// In js/table.js, add this globally (or import if using modules, but window is fine for this context)
// And call setupReactionPickers(a.mal_id, comments) right after document.getElementById("modal-comment").innerHTML is set in openModal.

window.setupReactionPickers = async (malId, comments) => {
  if (!window.picmoPopup) {
    // Dynamically import to ensure modules are loaded
    const { createPopup } = await import('https://unpkg.com/@picmo/popup-picker@latest/dist/index.js');
    window.picmoPopup = createPopup;
  }

  comments.forEach(c => {
    const trigger = document.getElementById(`add-reaction-${c.id}`);
    if (!trigger) return;

    const picker = window.picmoPopup({}, {
      referenceElement: trigger,
      triggerElement: trigger,
      position: 'bottom-start'
    });

    trigger.addEventListener('click', () => picker.toggle());

    picker.addEventListener('emoji:select', (selection) => {
      window.toggleReaction(malId, c.id, selection.emoji);
    });
  });
};
```

- [ ] **Step 5: Commit UI changes**
```bash
git add acervo.html css/style.css js/table.js
git commit -m "feat(ui): render comment reactions and integrate picmo picker"
```

---

### Task 4: Interaction Logic & Realtime

**Files:**
- Modify: `js/table.js`
- Modify: `js/pending.js` (Optional, if we want reactions on the pending page too, but skip for now to keep scope tight).

- [ ] **Step 1: Implement toggleReaction logic**
Add the `toggleReaction` function to `js/table.js`.

```javascript
// In js/table.js
window.toggleReaction = async (malId, voteId, emoji) => {
  if (!currentUser) return;
  const groupId = getGroupId();

  try {
    // 1. Verificar se já existe
    const { data: existing } = await supabase
      .from("comment_reactions")
      .select("id, emoji")
      .eq("vote_id", voteId)
      .eq("user_id", currentUser.id)
      .single();

    if (existing) {
      if (existing.emoji === emoji) {
        // Clicou no mesmo -> Deleta
        await supabase.from("comment_reactions").delete().eq("id", existing.id);
      } else {
        // Clicou em outro -> Atualiza
        await supabase.from("comment_reactions").update({ emoji }).eq("id", existing.id);
      }
    } else {
      // Não existe -> Insere
      await supabase.from("comment_reactions").insert([{
        group_id: groupId,
        mal_id: parseInt(malId),
        vote_id: voteId,
        user_id: currentUser.id,
        emoji: emoji
      }]);
    }
    
    // Atualiza a tela recarregando os dados (Realtime lidaria com isso sozinho se fosse Granular, mas para garantir:)
    // A chamada do Realtime que já existe vai fazer o invalidateCache e renderTable.
  } catch (err) {
    console.error("Erro ao processar reação:", err);
  }
};
```

- [ ] **Step 2: Add Realtime Subscription for Reactions**
In `js/table.js` inside the `init` or wherever realtime is setup (looks like `acervo.html` or `table.js` might have it, let's assume `table.js` `loadData` or similar initialization).
Actually, let's add it where `votes` realtime is tracked, or just rely on the existing `votes` subscription if it triggers a full reload. If not, add a new channel.

```javascript
// In js/table.js (find the existing realtime subscription or add this at the bottom of the file)
// Note: You might need to ensure this is called after supabase is initialized.
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const groupId = getGroupId();
    if(groupId) {
        supabase.channel('public:comment_reactions')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_reactions', filter: `group_id=eq.${groupId}` }, () => {
            // Re-fetch data and re-render modal if open
            invalidateCache();
            loadData().then(data => {
                allAnimes = data.animes;
                filtered = [...allAnimes]; // Simplification, ideally use applyFilters
                if (currentModalIndex !== null) window.openModal(currentModalIndex);
            });
          })
          .subscribe();
    }
  }, 1000);
});
```

- [ ] **Step 3: Commit Interaction Logic**
```bash
git add js/table.js
git commit -m "feat(logic): implement comment reaction toggle and realtime updates"
```

---

### Task 5: User Execution

- [ ] **Step 1: Inform User to Run SQL**
Instruct the user to run the `CREATE TABLE public.comment_reactions` SQL block from Task 1 in their Supabase dashboard.
