# UI/UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4 UI/UX fixes: a navbar member dropdown, modal focus locking, newline preservation in comments, and scrollable user lists on the Ciel page.

**Architecture:** Modifying existing Vanilla JS DOM manipulation logic and CSS styling to adjust layout behavior and event handling.

**Tech Stack:** HTML, Vanilla JavaScript, CSS.

---

### Task 1: Navbar Member Dropdown

**Files:**
- Modify: `navbar.html`
- Modify: `js/utils.js`
- Modify: `css/style.css`

- [ ] **Step 1: Update Navbar HTML Structure**
Modify `navbar.html` to add a container for the dynamic members, allowing us to structure the dropdown.

```html
<!-- Inside navbar.html, replace the <div id="dynamic-members"> with: -->
<div class="nav-person-group" id="nav-person-group-container">
  <!-- O usuário logado e o dropdown serão injetados aqui via JS -->
</div>
```

- [ ] **Step 2: Update Rendering Logic in utils.js**
Modify `loadNavbar` in `js/utils.js` to render the logged-in user as the main button and others inside a dropdown.

```javascript
// In js/utils.js, replace the membersHtml mapping logic inside loadNavbar:
      const currentUserMember = members.find(m => m.user_id === user.id);
      const otherMembers = members.filter(m => m.user_id !== user.id);

      let membersHtml = '';
      
      if (currentUserMember) {
        // Render logged-in user as the main visible button
        membersHtml += `
          <div class="nav-dropdown-container">
            <a href="profile.html#g=${groupId}&p=${escapeHTML(currentUserMember.nickname)}" class="nav-link nav-person current-user-btn" style="--nav-pill: ${currentUserMember.color}; --nav-pill-fill: ${currentUserMember.color}33;">
              <span class="nav-avatar" style="background:${currentUserMember.color};">${escapeHTML(currentUserMember.nickname.charAt(0).toUpperCase())}</span>
              ${escapeHTML(currentUserMember.nickname)} <span class="dropdown-caret">▼</span>
            </a>
            <div class="nav-dropdown-menu">
        `;
        
        // Render other members inside the dropdown
        otherMembers.forEach(m => {
          membersHtml += `
              <a href="profile.html#g=${groupId}&p=${escapeHTML(m.nickname)}" class="nav-link nav-person dropdown-item" style="--nav-pill: ${m.color}; --nav-pill-fill: ${m.color}33;">
                <span class="nav-avatar" style="background:${m.color};">${escapeHTML(m.nickname.charAt(0).toUpperCase())}</span>
                ${escapeHTML(m.nickname)}
              </a>
          `;
        });
        
        membersHtml += `
            </div>
          </div>
        `;
      } else {
        // Fallback se o usuário não for membro do grupo (admin global, etc)
        membersHtml = members.map(m => `
          <a href="profile.html#g=${groupId}&p=${escapeHTML(m.nickname)}" class="nav-link nav-person" style="--nav-pill: ${m.color}; --nav-pill-fill: ${m.color}33;">
            <span class="nav-avatar" style="background:${m.color};">${escapeHTML(m.nickname.charAt(0).toUpperCase())}</span>
            ${escapeHTML(m.nickname)}
          </a>
        `).join("");
      }

      desktopContainer.innerHTML = membersHtml;
```

- [ ] **Step 3: Add Dropdown CSS Styling**
Append styles for the dropdown to `css/style.css`.

```css
/* NAVBAR DROPDOWN STYLES */
.nav-dropdown-container {
  position: relative;
  display: inline-block;
}

.dropdown-caret {
  font-size: 10px;
  margin-left: 4px;
  opacity: 0.7;
}

.nav-dropdown-menu {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  background: var(--card);
  min-width: 160px;
  box-shadow: 0 8px 16px rgba(0,0,0,0.2);
  border-radius: 12px;
  padding: 8px;
  z-index: 1000;
  border: 1px solid var(--border);
  margin-top: 8px;
}

.nav-dropdown-container:hover .nav-dropdown-menu,
.nav-dropdown-container:focus-within .nav-dropdown-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-dropdown-menu .dropdown-item {
  width: 100%;
  justify-content: flex-start;
  padding: 8px 12px;
}
```

### Task 2: Comment Modal Focus

**Files:**
- Modify: `js/table.js`

- [ ] **Step 1: Remove Overlay Click Listener**
In `js/table.js`, find the event listener that closes the modal when clicking outside. Remove the condition that closes it on overlay click.

```javascript
// In js/table.js, locate the document click listener for the modal.
// Change it from:
// document.addEventListener("click", e => {
//   if (e.target.matches(".modal-overlay")) window.closeModal();
//   if (e.target.matches(".modal-close")) window.closeModal();
// });
// To:
document.addEventListener("click", e => {
  if (e.target.matches(".modal-close")) window.closeModal();
});
```

### Task 3: Comment Newline Bug Fix

**Files:**
- Modify: `js/data.js`
- Modify: `js/table.js`

- [ ] **Step 1: Keep Comments as Array in data.js**
Currently, `comentarios` are joined by `\n`. We should pass them as an array of objects to safely handle newlines within the comment text itself.

```javascript
// In js/data.js, inside the loadData map function:
// Change:
// comentarios: animeVotes.filter(v => v.comment).map(v => { const m = _members.find(member => member.user_id === v.user_id); return `${m ? m.nickname : 'Desconhecido'}: ${v.comment}`; }).join('\n')
// To:
      comentarios_array: animeVotes
        .filter(v => v.comment)
        .map(v => {
          const m = _members.find(member => member.user_id === v.user_id);
          return { nickname: m ? m.nickname : 'Desconhecido', text: v.comment };
        })
```

- [ ] **Step 2: Render Comments Array in table.js**
Update the modal rendering logic to iterate over the new `comentarios_array` and convert internal newlines to `<br>`.

```javascript
// In js/table.js, inside openModal function:
// Replace the old comment rendering logic (which split by \n):
// const commentsHtml = (a.comentarios || "").split('\n').filter(c => c.trim()).map(c => {
//   const [nick, ...rest] = c.split(':');
//   return `<div class="comment-item"><strong>${escapeHTML(nick)}</strong><p>${escapeHTML(rest.join(':').trim())}</p></div>`;
// }).join("");
//
// With the new array-based logic:
    const commentsHtml = (a.comentarios_array || []).map(c => {
      // escapeHTML escapes <, >, &, ", ', but leaves \n as \n
      // We then replace \n with <br> for HTML rendering
      const safeText = escapeHTML(c.text).replace(/\n/g, '<br>');
      return `<div class="comment-item">
                <strong>${escapeHTML(c.nickname)}</strong>
                <p>${safeText}</p>
              </div>`;
    }).join("");
```

### Task 4: Ciel Page User Selection Scroll

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Add Scroll Styles to Ciel Sidebar**
Add CSS to restrict the height and enable scrolling for the user selection list on the Ciel page.

```css
/* Add to css/style.css */
.ciel-sidebar {
  max-height: 70vh; /* Ou um valor fixo como 500px */
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(196, 181, 253, 0.58) rgba(255, 255, 255, 0.06);
}

.ciel-sidebar::-webkit-scrollbar {
  width: 6px;
}

.ciel-sidebar::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.ciel-sidebar::-webkit-scrollbar-thumb {
  background: rgba(196, 181, 253, 0.4);
  border-radius: 8px;
}

.ciel-sidebar::-webkit-scrollbar-thumb:hover {
  background: rgba(196, 181, 253, 0.6);
}
```

- [ ] **Step 5: Verify Changes (Manual Step)**
Refresh the application and verify:
1. Navbar shows a dropdown for multiple users.
2. Clicking the background of the comment modal does NOT close it.
3. Entering a comment with newlines renders correctly as a single comment box.
4. The Ciel page sidebar scrolls when filled with many users.
