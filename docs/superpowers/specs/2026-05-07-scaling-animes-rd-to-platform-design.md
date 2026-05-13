# Design Spec: Scaling AniLiber to a Multi-Group Platform

**Date:** 2026-05-07  
**Status:** Approved  
**Goal:** Transition Anime RD from a single-group static site to a multi-group dynamic platform to validate the "Shared Catalog" concept for wider audiences.

---

## 1. Overview
The platform will allow any user to register, create or join groups, and manage a shared anime catalog. Each group will have its own isolated list of animes, voting logic, and member identities. The architecture will shift from a static JSON-based model to a real-time dynamic model powered by **Supabase**.

## 2. Technical Stack
- **Frontend:** Vanilla JS (ES Modules), HTML5, CSS3.
- **Backend/Database:** Supabase (PostgreSQL, Auth, Row Level Security, Real-time).
- **Automation:** PostgreSQL Triggers (Approval logic) and Supabase Cron (Stale vote cleanup).

## 3. Database Schema

### `profiles`
Stores global user information.
- `id` (uuid, PK): Maps to `auth.users.id`.
- `email` (text): Primary identifier.

### `groups`
The container for a friend group.
- `id` (uuid, PK).
- `name` (text): Name of the group.
- `invite_code` (text, unique): Short code used for join links.
- `creator_id` (uuid, FK -> profiles): The admin of the group.

### `group_members`
Handles per-group member identity.
- `group_id` (uuid, FK -> groups).
- `user_id` (uuid, FK -> profiles).
- `nickname` (text): Customizable name for this group.
- `color` (text): Customizable hex color for this group.
- `role` (text): 'admin' or 'member'.
- *Constraint:* Primary Key is `(group_id, user_id)`.

### `animes`
The anime catalog per group.
- `id` (uuid, PK).
- `group_id` (uuid, FK -> groups).
- `mal_id` (int, nullable): MyAnimeList ID for metadata/images.
- `name` (text): Title of the anime.
- `status` (text): 'pending' or 'approved'.
- `created_at` (timestamp).

### `votes`
Individual votes and comments.
- `id` (uuid, PK).
- `anime_id` (uuid, FK -> animes).
- `user_id` (uuid, FK -> profiles).
- `score` (numeric, nullable): 1-10 or null for "Not Watched".
- `comment` (text, nullable).
- `created_at` (timestamp).

---

## 4. Key Logic & Business Rules

### Joining Mechanism
- Groups are joined via unique invite links (e.g., `index.html?join=ABC-123`).
- Admins (creators) have the power to kick members.
- **Admin Choice:** When kicking, the admin decides whether to preserve the user's data (votes/comments) or wipe it entirely.

### Approval Flow
- **Requirement:** Unanimous voting. An anime is approved only when every member of the group has cast a vote.
- **Automation (Trigger):** A SQL function runs after every `INSERT/UPDATE` on `votes`. If `count(votes) == count(group_members)`, the anime `status` is set to `'approved'`.
- **Stale Vote Cleanup:** A cron job runs every 24 hours. Any anime in `pending` status for > 5 days will have "Not Watched" (score: null) votes automatically inserted for members who haven't voted.

### User Identity
- Users can have a different nickname and color in every group they join.
- Initial group joining requires the user to pick their group-specific identity.

---

## 5. Security (Row Level Security)
- **Groups:** Visible only to members or creators.
- **Group Members:** Visible to other members of the same group.
- **Animes/Votes:** Read/Write access is restricted to members of the specific `group_id`.

---

## 6. Implementation Strategy

### Phase 1: Authentication & Dashboard
- Integrate Supabase Auth.
- Create a `dashboard.html` to list a user's groups and the "Create Group" form.

### Phase 2: Group View & Identity
- Refactor `js/data.js` to fetch member data and animes based on `?g={groupId}`.
- Implement the "First Time Join" identity selector.

### Phase 3: Dynamic Catalog
- Update `suggest.html` and `pending.html` to write/read from Supabase in real-time.
- Move from "Copy and Delete" (Firebase) to "Status Flip" (Supabase).

### Phase 4: Automation
- Implement SQL Triggers for approval.
- Set up Supabase Cron for the 5-day timeout logic.
