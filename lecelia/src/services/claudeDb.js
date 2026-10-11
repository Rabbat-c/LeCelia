/**
 * CLAUDE-SPECIFIC DEPENDENCY — DOES NOT WORK OUTSIDE A CLAUDE ARTIFACT
 * ====================================================================
 *
 * Rally's live data (events, attendees, notifications, account prefs)
 * is currently read and written through a global `claude` object that
 * only exists when this app is running inside a published Claude
 * Artifact page. There is no `claude` global in a normal browser tab,
 * in this Vite dev server, in the production build, or in a future
 * Capacitor/iOS/Android shell.
 *
 * This file does NOT change that. It is a documentation + isolation
 * seam, not a replacement backend. `App.jsx` still calls the Claude
 * `db` capability directly in ~24 places (every `dbRef.current.*`
 * call — search the file for that string to find them all), because
 * those calls are woven into business logic (approve/decline an
 * event, join/leave, follow a creator, delete an account, etc.) in
 * ways that are not safe to mechanically extract without a real
 * build/test loop to verify against. Fully isolating them behind a
 * generic data-access layer is the right next step, but it should
 * happen *together with* picking the real backend (Supabase, Firebase,
 * or a custom API) in a later migration step — see the project's
 * README for the full data model this will need to replicate.
 *
 * What's documented here:
 *  - connectClaudeDb(): the exact bootstrap call App.jsx makes.
 *  - isClaudeDbAvailable(): a guard so the app degrades to its
 *    existing "Live sync isn't available here" screen instead of
 *    throwing, when `claude` doesn't exist (which, outside an
 *    Artifact, is now always).
 *  - The shape of the `db` object the rest of the app expects, so a
 *    future replacement service can implement the same surface.
 */

/**
 * @returns {boolean} true only inside a Claude Artifact that has
 * declared the `db` capability.
 */
export function isClaudeDbAvailable() {
  return typeof globalThis.claude !== "undefined" && typeof globalThis.claude.use === "function";
}

/**
 * Attempts the same connection App.jsx performs on mount. Resolves to
 * `null` (not a thrown error) when unavailable, matching the existing
 * `dbUnavailable` fallback behavior in App.jsx.
 *
 * The returned object (when available) exposes, per the Claude
 * Artifact `db` capability contract:
 *   db.doc(path).get() / .set(data) / .update(patch) / .delete() / .onSnapshot(cb)
 *   db.collection(path).get() / .add(data) / .onSnapshot(cb) / .limit(n).get()
 *
 * Collections actually used by Rally today (see README → "Data model"):
 *   events/{id}         — one doc per event, { status: "pending" | "live", ... }
 *   userPrefs/{contact}  — one doc per account, { name, city, interests, ... }
 *   notifications/{contact} — one doc per account, { items: [...] }
 */
export async function connectClaudeDb() {
  if (!isClaudeDbAvailable()) return null;
  try {
    return await globalThis.claude.use("db");
  } catch (e) {
    return null;
  }
}
