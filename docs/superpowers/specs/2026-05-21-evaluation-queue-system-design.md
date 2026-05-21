# Evaluation Queue System Design Spec

**Date:** 2026-05-21
**Status:** Approved

## 1. Overview
The Evaluation Queue System replaces the legacy Approval Queue. The goal is to allow immediate content availability (instant entry to the library) while maintaining a personalized queue of animes that each user hasn't yet evaluated (scored or marked as "Not Watched").

## 2. Core Architectural Changes

### 2.1. Instant Approval Logic
- Animes suggested by any member will now be saved with `status: 'approved'` immediately.
- This eliminates the need for a global group consensus before an anime appears in the library, charts, or blog.

### 2.2. Database & Automations
- **SQL Triggers:** Existing triggers that auto-approve animes when vote count matches member count must be disabled or removed.
- **5-Day Rule:** The `supabase-cleanup.js` script and its associated GitHub Action (`supabase-cleanup.yml`) are no longer required for approval purposes and will be disabled.

## 3. Frontend Implementation

### 3.1. Rebranding (UI)
- Rename all instances of "Fila de Aprovação" (Approval Queue) to **"Avaliações Pendentes"** (Pending Evaluations).
- Affected files: `navbar.html`, `pending.html`, `historico.html`.

### 3.2. Personalized Queue Logic (`js/pending.js`)
- **Data Fetching:** Update the query to fetch all animes in the current group regardless of status (or specifically `status: 'approved'`).
- **Personal Filtering:**
    - Filter the list locally to show only animes where the `currentUser.id` is **NOT** present in the `votes` array.
    - An interaction (real score or "Not Watched"/null score) counts as a completion and removes the anime from that user's specific queue.

### 3.3. Personal Badge Logic (`js/utils.js`)
- Update the `updatePendingBadge` function.
- The badge will now reflect the count of animes in the group that the **current user** has not yet voted on.
- This count will vary from user to user within the same group.

### 3.4. Suggestion Flow (`js/suggest.js`)
- Update the submission logic to explicitly set `status: 'approved'` when inserting into `group_animes`.

## 4. Testing Criteria
- [ ] New suggestions appear immediately in `acervo.html`.
- [ ] Animes only appear in `pending.html` if the user hasn't voted.
- [ ] Voting "Not Watched" successfully removes the item from the queue.
- [ ] Navbar badge count matches the number of items visible in the Evaluation Queue.
