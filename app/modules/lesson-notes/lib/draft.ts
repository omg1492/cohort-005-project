import { MAX_NOTE_LENGTH } from "~/lib/notes";
import { noteBody, noteText } from "./rules";

export type NoteDraft = {
  length: number;
  max: number;
  tooLong: boolean;
  empty: boolean;
  unchanged: boolean;
  canSave: boolean;
};

// Judged by the same schema the server parses with, so whitespace at the ends
// neither counts, nor makes an otherwise empty note savable, nor makes a saved
// note look edited.
export function describeDraft(body: string, saved: string): NoteDraft {
  const text = noteText.parse(body);
  const parsed = noteBody.safeParse(body);
  // trim, min and max cannot fail together, so there is at most one issue.
  const failure = parsed.error?.issues[0].code;
  const tooLong = failure === "too_big";
  const empty = failure === "too_small";
  const unchanged = text === saved;
  return {
    length: text.length,
    max: MAX_NOTE_LENGTH,
    tooLong,
    empty,
    unchanged,
    canSave: parsed.success && !unchanged,
  };
}
