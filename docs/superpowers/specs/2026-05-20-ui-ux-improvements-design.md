# UI/UX Improvements Design Spec

**Date:** 2026-05-20
**Status:** Approved

## 1. Overview
This document outlines a set of four distinct UI/UX improvements based on user feedback. The changes aim to resolve layout breaking issues on smaller screens/large groups, prevent data loss during data entry, fix rendering bugs related to text formatting, and improve scroll accessibility on specific pages.

## 2. Features and Solutions

### 2.1. Navbar Member Dropdown
**Problem:** The navigation bar overflows and breaks its layout when a group has a large number of members, as each member currently gets their own visible button.
**Solution:**
- Convert the flat list of member links into a consolidated dropdown menu.
- **Trigger Element:** The main visible button in the navbar will display the avatar/nickname of the currently logged-in user, appended with a downward caret icon (`▼`) to indicate expandability.
- **Dropdown Content:** The menu will list the remaining members of the group.
- **Interaction:** The dropdown will open on `hover` for desktop users and on `click` for mobile/touch devices.
- **Affected Files:** `js/utils.js` (rendering logic), `css/style.css` (dropdown styling).

### 2.2. Comment Modal Focus (Data Loss Prevention)
**Problem:** Clicking outside the modal or switching applications triggers an automatic closure of the comment modal, causing users to lose any text they were typing.
**Solution:**
- Implement a "strict focus" mode for the modal.
- Remove the event listener that closes the modal when the `.modal-overlay` (background) is clicked.
- The modal will now exclusively close via explicit user actions: clicking the "Save" button, the "Cancel" button, or the top-right "X" close button.
- **Affected Files:** `js/table.js` (modal event listeners), `css/style.css` (potentially adjusting cursor on overlay).

### 2.3. Comment Newline Bug Fix
**Problem:** When a user types a comment containing line breaks (using the `ENTER` key), the system incorrectly parses and renders the text as multiple, separate comments in the library view.
**Solution:**
- The root cause is likely the aggregation logic in `js/data.js` or the rendering logic in `js/table.js` that splits or joins comments using newline characters (`\n`) as delimiters between different users' comments.
- **Data Aggregation:** Ensure that when fetching comments, they are treated as an array of objects `{ user, comment }` rather than a single concatenated string.
- **Rendering:** Update the HTML generation in `js/table.js` (specifically within the modal details) to iterate over the comment array. For each comment, safely convert internal `\n` characters to `<br>` tags to preserve formatting without breaking the DOM structure.
- **Affected Files:** `js/data.js`, `js/table.js`.

### 2.4. Ciel Page User Selection Scroll
**Problem:** The user selection list on the `ciel.html` page does not support scrolling, making it impossible to select users located at the bottom of the list in large groups.
**Solution:**
- Apply CSS constraints to the user selection container.
- Introduce a `max-height` property (e.g., `400px` or a relative viewport height).
- Set `overflow-y: auto` to enable vertical scrolling when the content exceeds the maximum height.
- Style the scrollbar to match the application's dark theme aesthetics.
- **Affected Files:** `css/style.css`.

## 3. Implementation Plan
After this document is reviewed, the `writing-plans` skill will be invoked to break down these 4 features into actionable, sequential tasks for implementation.