import { MAX_NOTE_LENGTH } from "~/lib/notes";
import { describeDraft, type NoteDraft } from "./lib/draft";

export type { NoteDraft };

/**
 * What the note editor should show for the text in its box: the character
 * count against the limit, and whether Save is allowed. It mirrors the
 * server's rules so a Student sees a refusal before they submit.
 */
export function noteDraft(body: string): NoteDraft {
  return describeDraft(body, MAX_NOTE_LENGTH);
}
