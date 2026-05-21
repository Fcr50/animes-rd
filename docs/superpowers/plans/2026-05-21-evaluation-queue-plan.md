# Evaluation Queue System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the 'Approval Queue' into a personalized 'Evaluation Queue' where animes enter the library immediately, and the queue only shows titles a specific user hasn't voted on.

**Architecture:** 
- Update frontend UI text to "Avaliações Pendentes".
- Update suggestion logic to save with `status: 'approved'`.
- Update pending logic to fetch all animes and filter out those the user has already voted on.
- Update navbar badge logic to reflect individual pending counts.

**Tech Stack:** HTML, Vanilla JavaScript, Supabase.

---

### Task 1: UI Rebranding

**Files:**
- Modify: `navbar.html`
- Modify: `pending.html`
- Modify: `historico.html`
- Modify: `js/pending.js`

- [ ] **Step 1: Update Navbar text**
Change "Fila de Aprovação" to "Avaliações Pendentes" in `navbar.html`.

```html
<!-- navbar.html -->
<a class="nav-link group-only" href="pending.html">Avaliações Pendentes</a>
```

- [ ] **Step 2: Update Pending page text**
Update title and description in `pending.html`.

```html
<!-- pending.html -->
<title>Avaliações Pendentes | AniLiber</title>
...
<h1>Avaliações Pendentes</h1>
<p>Animes que você ainda não avaliou neste grupo.</p>
```

- [ ] **Step 3: Update History page button text**
Update the back button in `historico.html`.

```html
<!-- historico.html -->
<a href="pending.html" class="pending-history-btn">← Avaliações pendentes</a>
```

- [ ] **Step 4: Update Pending JS messages**
Update empty state messages in `js/pending.js`.

```javascript
// js/pending.js -> renderList
<p style="font-size: 20px; font-weight: 800; color: #4ade80; margin: 0 0 8px;">Você está em dia!</p>
<p style="color: rgba(134,239,172,0.5); font-size: 14px; margin: 0 0 28px;">Nenhum anime aguardando sua avaliação.</p>
```

- [ ] **Step 5: Commit UI Rebranding**
```bash
git add navbar.html pending.html historico.html js/pending.js
git commit -m "ui: rebrand Approval Queue to Evaluation Queue"
```

---

### Task 2: Instant Approval & Suggestion Logic

**Files:**
- Modify: `js/suggest.js`

- [ ] **Step 1: Set status to approved on suggestion**
Update `handleSubmit` to save new animes with `status: 'approved'`.

```javascript
// js/suggest.js -> handleSubmit
    const { error } = await supabase.from("group_animes").insert([
      {
        group_id: currentGroupId,
        mal_id: currentAnimeData.malId,
        added_by: currentUser.id,
        status: "approved", // Changed from 'pending'
        links,
      },
    ]);
```

- [ ] **Step 2: Set status to approved on import**
Update `handleImport` to save imported animes with `status: 'approved'`.

```javascript
// js/suggest.js -> handleImport
      const { error: groupError } = await supabase.from("group_animes").insert([
        {
          group_id: currentGroupId,
          mal_id: malId,
          added_by: currentUser.id,
          status: "approved", // Changed from 'pending'
        },
      ]);
```

- [ ] **Step 3: Commit Suggestion Logic**
```bash
git add js/suggest.js
git commit -m "feat: implement instant approval for suggested animes"
```

---

### Task 3: Personalized Queue Logic

**Files:**
- Modify: `js/pending.js`

- [ ] **Step 1: Remove status filter from data fetching**
Update `loadPendingAnimes` to fetch all group animes regardless of status.

```javascript
// js/pending.js -> loadPendingAnimes
async function loadPendingAnimes() {
  const { data: list, error } = await supabase
    .from('group_animes')
    .select(`
      status,
      mal_id,
      links,
      added_by,
      animes (name, genres, image_url),
      votes (user_id, score, comment)
    `)
    .eq('group_id', currentGroupId); // Removed .eq('status', 'pending')

  if (error) return;

  const stillPendingForMe = list.filter(item => {
    const userVotes = item.votes || [];
    return !userVotes.some(v => v.user_id === currentUser.id);
  });

  renderList(stillPendingForMe);
}
```

- [ ] **Step 2: Commit Personalized Queue Logic**
```bash
git add js/pending.js
git commit -m "feat: implement personalized evaluation queue logic"
```

---

### Task 4: Personal Badge Logic

**Files:**
- Modify: `js/utils.js`

- [ ] **Step 1: Update badge count logic**
Update `updatePendingBadge` to reflect the personal pending count.

```javascript
// js/utils.js -> updatePendingBadge
async function updatePendingBadge(user, groupId) {
  if (!user || !groupId) return;

  try {
    // 1. Busca TODOS os animes no grupo
    const { data: allAnimes } = await supabase
      .from("group_animes")
      .select("mal_id")
      .eq("group_id", groupId);

    if (!allAnimes || allAnimes.length === 0) return;

    // 2. Busca em quais o usuário já votou
    const { data: userVotes } = await supabase
      .from("votes")
      .select("mal_id")
      .eq("group_id", groupId)
      .eq("user_id", user.id);

    const votedIds = new Set(userVotes?.map((v) => v.mal_id));
    const pendingCount = allAnimes.filter((a) => !votedIds.has(a.mal_id)).length;
...
```

- [ ] **Step 2: Commit Personal Badge Logic**
```bash
git add js/utils.js
git commit -m "feat: update navbar badge to show personalized pending count"
```

---

### Task 5: Cleanup and Final Instructions

- [ ] **Step 1: Final Review**
Instruct user to disable legacy triggers and scripts manually in Supabase and GitHub.
