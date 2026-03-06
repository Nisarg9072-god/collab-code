# Phase 5 Collaboration: Browser Test Script

**Objective:** To manually validate the real-time collaboration feature in a live, two-client browser environment.

**Setup:**
1.  **Window A:** Open a browser (e.g., Chrome) and log in as **User A**.
2.  **Window B:** Open a separate browser or an incognito window and log in as **User B**.
3.  Both windows must navigate to the same workspace.

---

### Test 1: Live Sync & Remote Presence

**Goal:** Verify that text edits, cursor movements, and selections are synced instantly and correctly.

| Step | Window | Action | Expected Result | Failure Symptoms | Likely Root Cause |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1.1 | A & B | Open the same file (e.g., `main.js`). | Both windows show the file content. The participant list shows both User A and User B. | Participant list is incorrect or empty. | `WebsocketProvider` connection or `awareness` protocol issue. |
| 1.2 | A | Type `// Hello from User A`. | Text appears in Window A. In Window B, the text appears instantly. | Text is delayed, duplicated, or doesn't appear in Window B. | `Y.Doc` update is not being sent or received correctly via the WebSocket. |
| 1.3 | B | On a new line, type `console.log("Hi from User B");`. | Text appears in Window B. In Window A, the text appears instantly. | Text is delayed or doesn't appear in Window A. | Same as above; issue with WebSocket broadcast or CRDT merging. |
| 1.4 | A | Click to move your cursor to the end of User B's line. | In Window B, User A's remote cursor appears at the end of the line. | Remote cursor doesn't appear or is in the wrong place. | `awareness` state for cursor position is not being broadcast or rendered. |
| 1.5 | B | Select the text `// Hello from User A`. | In Window A, User B's remote selection highlights the text. | Remote selection doesn't appear or is incorrect. | `awareness` state for selection range is not being broadcast or rendered. |

---

### Test 2: File Switching & Session Lifecycle

**Goal:** Verify that collaboration sessions are correctly managed when navigating between files.

| Step | Window | Action | Expected Result | Failure Symptoms | Likely Root Cause |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2.1 | A | Open a different file (e.g., `styles.css`). | Window A shows `styles.css`. The participant list in Window A shows only User A. In Window B, the participant list for `main.js` now shows only User B. | Participant lists are not updated correctly. | `useCollaborationSession` hook is not re-running on `activeFileId` change, or the new provider is incorrect. |
| 2.2 | A | Type `body { background: #111; }` in `styles.css`. | Text appears in Window A. No changes appear in Window B (`main.js`). | Text from `styles.css` leaks into `main.js`. | Critical issue. The `Y.Doc` or `provider` for the two files is somehow shared. Likely a problem in `collaborationManager` room logic. |
| 2.3 | A | Switch back to the `main.js` tab. | Window A shows the correct, collaborative content of `main.js`. The participant list in both windows shows User A and User B again. | Content is stale or missing. Participant list is incorrect. | The existing provider for `main.js` was not correctly retrieved from the `collaborationManager`. |

---

### Test 3: Tab Close & Disconnect

**Goal:** Verify that closing a tab cleanly destroys the session and updates presence.

| Step | Window | Action | Expected Result | Failure Symptoms | Likely Root Cause |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 3.1 | A | Close the browser tab for the workspace. | In Window B, User A disappears from the participant list within a few seconds. User A's remote cursor/selection disappears. | User A remains in the participant list indefinitely. | The `destroyProvider` call in `handleTabClose` is not working, or the `y-websocket` server is not correctly detecting the disconnect. |
| 3.2 | A | Re-open the workspace and the `main.js` file. | In Window B, User A reappears in the participant list. | User A does not reappear. | Initial connection logic in `getProvider` is failing on the second attempt. |

---

### Test 4: Dirty State & Save Behavior

**Goal:** Verify that the dirty state and save function work reliably with concurrent edits.

| Step | Window | Action | Expected Result | Failure Symptoms | Likely Root Cause |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 4.1 | B | With both users in `main.js`, type a single character. | The "save" icon/indicator in both Window A and Window B should immediately show a "dirty" state (e.g., a filled circle). | Dirty state does not appear, or only appears in Window B. | The `ytext.observe` listener in `WorkspaceIDE` is not firing or updating the `isDirty` state correctly. |
| 4.2 | A | Press `Ctrl+S` (or click Save). | The dirty state indicator should clear for both users simultaneously. | Dirty state only clears for User A, or not at all. | The `handleSave` function is not correctly updating the file's base `content` state after a successful save. |
| 4.3 | A & B | Both users make several edits. | The file should remain in a dirty state. | N/A | N/A |
| 4.4 | B | Press `Ctrl+S` to save. | The final, merged content containing edits from both users is persisted. The dirty state clears for both users. | Saved content is missing edits from one user. | The `handleSave` function is reading from a stale source (like the old `code` state) instead of `provider.doc.getText('monaco').toString()`. |
