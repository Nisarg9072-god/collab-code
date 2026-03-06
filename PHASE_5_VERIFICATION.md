# Phase 5 Collaboration: Manual Verification Checklist

This document outlines the manual testing steps required to fully verify the real-time collaboration features implemented in Phase 5.

**Objective:** To confirm that the Yjs and Monaco integration is stable, reliable, and free of leaks or race conditions through multi-client testing.

**Pre-requisites:**
1.  Backend and frontend servers are running.
2.  Two separate browser windows (or tabs), logged in as two different users (e.g., User A, User B).
3.  Both users have access to the same workspace.

---

## Test Cases

### 1. Live Collaborative Editing

| # | User | Action | Expected Result (User A) | Expected Result (User B) |
|---|---|---|---|---|
| 1.1 | A & B | Open the same workspace and the same file (e.g., `main.js`). | Editor shows file content. Participant list shows User A and User B. | Editor shows file content. Participant list shows User A and User B. |
| 1.2 | A | Type "Hello from User A". | Text "Hello from User A" appears in the editor. | Text "Hello from User A" appears instantly in the editor. |
| 1.3 | B | On a new line, type "Hello from User B". | Text "Hello from User B" appears instantly on the new line. | Text "Hello from User B" appears on the new line. |
| 1.4 | A & B | Both users type simultaneously on different lines. | Both users' text appears correctly without conflicts or data loss. | Both users' text appears correctly without conflicts or data loss. |

### 2. Awareness and Presence

| # | User | Action | Expected Result (User A) | Expected Result (User B) |
|---|---|---|---|---|
| 2.1 | A | Move the cursor to the first line. | Cursor for User B is visible at its current position. | Cursor for User A is visible on the first line. |
| 2.2 | B | Select the text "Hello from User A". | The text "Hello from User A" is highlighted with User B's selection color. | The selection is visible in User B's editor. |
| 2.3 | B | Close the browser window/tab. | User B disappears from the participant list within a few seconds. User B's cursor/selection disappears. | N/A |
| 2.4 | B | Re-open the file. | User B reappears in the participant list. | User B sees User A in the participant list. |

### 3. File and Tab Management

| # | User | Action | Expected Result (User A) | Expected Result (User B) |
|---|---|---|---|---|
| 3.1 | A | Open a different file (`styles.css`) in the same workspace. User B remains in `main.js`. | Editor shows content for `styles.css`. Participant list for `styles.css` shows only User A. | User B is unaffected and remains in `main.js`. Participant list for `main.js` shows only User B now. |
| 3.2 | A | Type "body { color: red; }" in `styles.css`. | Text appears in `styles.css`. | No changes appear in `main.js`. |
| 3.3 | A | Switch back to the `main.js` tab. | Editor shows the collaborative content of `main.js`. Participant list shows User A and User B again. | User A reappears in the participant list for `main.js`. |
| 3.4 | A | Close the tab for `main.js`. | The tab for `main.js` is closed. | User A disappears from the participant list for `main.js`. |

### 4. Dirty State and Save Behavior

| # | User | Action | Expected Result (User A) | Expected Result (User B) |
|---|---|---|---|---|
| 4.1 | A & B | Both open `main.js`. The file is in a saved state. | `isDirty` is false (no save indicator). | `isDirty` is false (no save indicator). |
| 4.2 | B | Type a new character. | `isDirty` becomes true for both users. | `isDirty` becomes true. |
| 4.3 | A | Press Ctrl + S to save the file. | `isDirty` becomes false for both users. The save status indicator shows "saved". | `isDirty` becomes false. The save status indicator shows "saved". |
| 4.4 | A & B | Both make edits. User A saves, then User B saves a moment later. | The final saved content on the server should reflect both edits correctly. | The final saved content on the server should reflect both edits correctly. |
