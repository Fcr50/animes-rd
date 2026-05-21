# Global Profile System Design Spec

**Date:** 2026-05-20
**Status:** Approved

## 1. Overview
The Global Profile System transforms individual group membership into a unified user identity within the AniLiber platform. It centralizes social data (Bio, Favorites, Openings) globally while allowing users to maintain specific nicknames and colors within different groups (Hybrid Scenario B).

## 2. Database Schema Changes (Supabase)

### 2.1. `profiles` Table Expansion
Add the following columns to the `public.profiles` table:
- `nickname` (text): Global default nickname.
- `color` (text): Global brand color.
- `bio` (text): User biography (max 360 chars).
- `avatar_url` (text): URL to profile picture.
- `favorites` (jsonb): 
    - `animes`: `[{ mal_id, name, image_url }]` (Max 3)
    - `openings`: `[{ name, url }]` (Max 3)
- `preferences` (jsonb):
    - `favorite_genre` (text)
    - `vibe` (text)

### 2.2. `group_members` Table Modification
- **Remove Column:** `openings` (Data will be migrated to `profiles.favorites.openings`).
- **Retain:** `nickname` and `color` (To support group-specific overrides).

## 3. Data Migration Strategy
A Node.js script will be provided to:
1. Fetch existing `openings` from `group_members` for each unique `user_id`.
2. Consolidate them into the new `profiles.favorites.openings` field.
3. If a user has different lists across groups, the one from the most recently joined group will be prioritized.

## 4. Frontend Implementation (`account.html` & `js/account.js`)

### 4.1. Favorite Anime Search
- Implement Jikan API (v4) search on the "Top 3 Animes" input fields.
- Use a debounced search to show a dropdown of results.
- Store full metadata (`mal_id`, `title`, `image_url`) upon selection.

### 4.2. Opening Management
- Split each opening favorite into two distinct inputs: `Name` and `URL`.
- Validate URLs to ensure they are properly formatted links.

### 4.3. Real-time Preview
- Bind `input` events from all form fields to the sidebar preview card.
- Specifically update the `CSS variables` for profile colors and the text content for Bio and Name.

### 4.4. Saving Logic
- Update `profiles` table via `upsert`.
- Offer a checkbox or prompt to "Sync these changes to all my current groups", which will trigger a bulk update of `nickname` and `color` in the `group_members` table for that user.

## 5. Public Profile Integration (`js/profile.js`)
Update the public profile page to:
1. Prioritize data from the `profiles` table for social info (Bio, Favorites, Openings).
2. Use `group_members` data specifically for the context-aware `color` and `nickname` related to the group being viewed.

## 6. Testing Criteria
- [ ] Profile data persists across different browser sessions.
- [ ] Top 3 animes correctly display posters in the public profile.
- [ ] Favorite openings links are clickable and lead to the correct external URL.
- [ ] Group-specific nicknames are preserved when global sync is not selected.
