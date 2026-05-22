# Comment Reactions System Design Spec

**Date:** 2026-05-21
**Status:** Approved

## 1. Overview
The Comment Reactions System enhances user interaction by allowing group members to react to each other's anime comments with a fixed set of emojis. This feature promotes social engagement and provides quick feedback on reviews.

## 2. Database Schema (Supabase)

### 2.1. `comment_reactions` Table
A new table will be created to track reactions:
- `id`: uuid (Primary Key)
- `vote_id`: uuid (Foreign Key to `public.votes.id`) - **This ensures the reaction is tied to a specific comment.**
- `user_id`: uuid (The ID of the user giving the reaction)
- `emoji`: text (One of: ❤️, 😂, 👍, 🔥, 😮)
- `created_at`: timestamp with time zone

### 2.2. Constraints
- **Uniqueness:** A unique constraint on `(vote_id, user_id)` ensures a user can only have one active reaction per specific comment.

## 3. Frontend Implementation

### 3.1. Data Aggregation (`js/data.js`)
- The `comentarios_array` will be updated to include the `id` of the vote record.
- **New Structure:** `{ id: uuid, nickname: text, text: text, reactions: object }`.

### 3.2. Reaction Bar (`js/table.js`)
- Each comment in the anime modal will feature a reaction area below the text.
- **Display:** Shows a list of unique emojis used, followed by the total count for each.
- Emojis reacted to by the current user should be highlighted.

### 3.3. Reaction Picker
- A small "Add Reaction" button (icon-only) next to the comment.
- **UI:** Clicking opens a popover menu with the 5 fixed emojis.
- **Toggle Logic:** 
    - Clicking a new emoji replaces the previous reaction for that `vote_id`.
    - Clicking the *same* emoji removes the reaction.

### 3.4. Realtime Updates
- The modal will subscribe to the `comment_reactions` table changes via Supabase Realtime, filtered by the `vote_id`s visible in the current modal.

## 4. Interaction Logic
- When a user clicks an emoji:
    1. Check if a record exists for `(vote_id, user_id)`.
    2. If it's the same emoji -> DELETE.
    3. If it's a different emoji -> UPDATE.
    4. If no reaction exists -> INSERT.

## 5. Testing Criteria
- [ ] Clicking an emoji correctly updates the database.
- [ ] User can only have one active emoji per comment.
- [ ] Realtime: Reactions from other users appear without closing the modal.
- [ ] The reaction bar correctly aggregates counts.
