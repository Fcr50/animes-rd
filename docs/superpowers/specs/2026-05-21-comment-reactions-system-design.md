# Comment Reactions System Design Spec

**Date:** 2026-05-21
**Status:** Approved

## 1. Overview
The Comment Reactions System enhances user interaction by allowing group members to react to each other's anime comments with a fixed set of emojis. This feature promotes social engagement and provides quick feedback on reviews.

## 2. Database Schema (Supabase)

### 2.1. `comment_reactions` Table
A new table will be created to track reactions:
- `id`: uuid (Primary Key)
- `group_id`: uuid (Foreign Key to `public.groups`)
- `mal_id`: integer (Anime ID)
- `comment_author_id`: uuid (The ID of the user who wrote the comment)
- `user_id`: uuid (The ID of the user giving the reaction)
- `emoji`: text (One of: ❤️, 😂, 👍, 🔥, 😮)
- `created_at`: timestamp with time zone

### 2.2. Constraints
- **Uniqueness:** A unique constraint on `(group_id, mal_id, comment_author_id, user_id)` ensures a user can only have one active reaction per comment.

## 3. Frontend Implementation

### 3.1. Reaction Bar (`js/table.js`)
- Each comment in the anime modal will feature a reaction area below the text.
- **Display:** Shows a list of unique emojis used, followed by the total count for each.
- **Visual Feedback:** Emojis reacted to by the current user should be highlighted or have a distinct background.

### 3.2. Reaction Picker
- A small "Add Reaction" button (icon-only) next to the comment.
- **UI:** Clicking the button opens a small, non-obtrusive popover menu with the 5 fixed emojis.
- **Toggle Logic:** 
    - Clicking a new emoji replaces the previous reaction.
    - Clicking the *same* emoji removes the reaction.

### 3.3. Realtime Updates
- The modal will subscribe to the `comment_reactions` table changes via Supabase Realtime, filtered by the current `group_id` and `mal_id`.

## 4. Interaction Logic
- When a user clicks an emoji:
    1. Check if the user already has a reaction for this specific comment.
    2. If it's the same emoji -> DELETE.
    3. If it's a different emoji -> UPDATE/UPSERT.
    4. If no reaction exists -> INSERT.

## 5. Testing Criteria
- [ ] Clicking an emoji correctly updates the database.
- [ ] User can only have one active emoji per comment.
- [ ] Realtime: Reactions from other users appear without closing the modal.
- [ ] The reaction bar correctly aggregates counts.
