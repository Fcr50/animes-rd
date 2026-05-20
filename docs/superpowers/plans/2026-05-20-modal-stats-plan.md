# Modal Statistics Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the anime details modal by moving individual scores into the comments section and replacing the top square boxes with prominent statistics cards (Média, Controvérsia, Votos).

**Architecture:** Modifying the `openModal` function in `js/table.js` to change the HTML generated for the modal, and adding new CSS rules in `style.css` for the stat cards.

**Tech Stack:** Vanilla JS, CSS.

---

### Task 1: Refactor Modal Content Generation

**Files:**
- Modify: `js/table.js`

- [ ] **Step 1: Empty the modal-notes container and redesign modal-meta**
In `js/table.js` inside `window.openModal`, find the assignment to `document.getElementById("modal-notes").innerHTML` and the generation of `metaItems`.
We will clear `modal-notes` and transform `modal-meta` into a grid of cards.

```javascript
// In js/table.js, replace the entire block from:
// document.getElementById("modal-notes").innerHTML = [...members] ...
// down to:
// .join(""); (the end of the modal-meta assignment)

// WITH THIS:

  // 1. Esvazia os quadrados de notas do topo
  document.getElementById("modal-notes").innerHTML = "";

  // 2. Transforma as estatísticas em cards de destaque
  const metaCards = [];
  if (a.nota !== null) {
    metaCards.push(`
      <div class="modal-stat-card">
        <div class="stat-label">Média do Grupo</div>
        <div class="stat-value" style="color:#ff9dcc">${Number(a.nota).toFixed(2)}</div>
      </div>
    `);
  }
  if (a.controversia !== null) {
    const hot = a.controversia > 1.5 ? "🌶️ " : "";
    metaCards.push(`
      <div class="modal-stat-card">
        <div class="stat-label">Controvérsia</div>
        <div class="stat-value" style="color:#86efac">${hot}${Number(a.controversia).toFixed(1)}</div>
      </div>
    `);
  }
  if (a.qtdVotos != null) {
    metaCards.push(`
      <div class="modal-stat-card">
        <div class="stat-label">Total de Votos</div>
        <div class="stat-value" style="color:#67e8f9">${a.qtdVotos}</div>
      </div>
    `);
  }
  
  document.getElementById("modal-meta").innerHTML = metaCards.length 
    ? `<div class="modal-stats-grid">${metaCards.join("")}</div>`
    : "";
```

- [ ] **Step 2: Inject scores into comments**
Still in `js/table.js`, find the assignment to `document.getElementById("modal-comment").innerHTML` and add the score next to the user's name.

```javascript
// In js/table.js, replace the return statement inside the comments mapping:
// return `<article class="comment-item" style="--comment-accent:${color}">
//   <strong style="color:${color}">${escapeHTML(c.nickname.trim())}</strong>
//   <p>${safeText}</p>
// </article>`;

// WITH THIS:

            const nota = a[`nota${c.nickname.trim()}`];
            const notaHtml = nota !== null && nota !== undefined 
              ? `<span class="comment-score-badge ${notaColor(nota)}">★ ${Number(nota).toFixed(1)}</span>` 
              : '';

            return `<article class="comment-item" style="--comment-accent:${color}">
            <div class="comment-header">
              <strong style="color:${color}">${escapeHTML(c.nickname.trim())}</strong>
              ${notaHtml}
            </div>
            <p>${safeText}</p>
          </article>`;
```

### Task 2: Add CSS for New Modal Layout

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Add new styles**
Append the following CSS to the end of `css/style.css` to style the new stat cards and comment badges.

```css
/* MODAL REDESIGN STYLES */
.modal-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 16px;
  margin-bottom: 24px;
}

.modal-stat-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 16px 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.modal-stat-card .stat-label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.modal-stat-card .stat-value {
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
  font-family: "Baloo 2", "Inter", sans-serif;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.comment-score-badge {
  font-size: 11px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--paper);
}

.comment-score-badge.green { color: #86efac; background: rgba(134, 239, 172, 0.15); }
.comment-score-badge.yellow { color: #fde047; background: rgba(253, 224, 71, 0.15); }
.comment-score-badge.red { color: #fca5a5; background: rgba(252, 165, 165, 0.15); }

/* Adaptações para tema claro (opcional/segurança) */
body:not(.dark-theme) .modal-stat-card {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.06);
}
body:not(.dark-theme) .modal-stat-card .stat-label { color: #5f594f; }
body:not(.dark-theme) .comment-score-badge {
  background: rgba(0, 0, 0, 0.06);
  color: #171717;
}

@media (max-width: 600px) {
  .modal-stats-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .modal-stat-card {
    padding: 12px;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
  .modal-stat-card .stat-label {
    margin-bottom: 0;
  }
}
```
