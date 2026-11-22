import { describeDraft, type NoteDraft } from "./lib/draft";
import { noteBody } from "./lib/rules";

export type { NoteDraft };

/**
 * The schema a note's body must pass to be saved: trimmed, not empty, and
 * within the limit. The server parses with it, and `noteDraft` judges the
 * editor's box by it, so the two cannot drift apart.
 */
export const noteBodySchema = noteBody;

/**
 * What the note editor should show for the text in its box, given the note
 * already saved: the character count against the limit, and whether Save is
 * allowed.
 */
export function noteDraft(body: string, saved = ""): NoteDraft {
  return describeDraft(body, saved);
}
