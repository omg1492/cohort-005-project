import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraft = {
  length: number;
  max: number;
  tooLong: boolean;
  empty: boolean;
  unchanged: boolean;
  canSave: boolean;
};

// The server trims before it checks the limit and before it stores the note,
// so whitespace at the ends neither counts, nor makes an otherwise empty note
// savable, nor makes a saved note look edited.
export function describeDraft(body: string, saved: string): NoteDraft {
  const text = body.trim();
  const length = text.length;
  const tooLong = length > MAX_NOTE_LENGTH;
  const empty = length === 0;
  const unchanged = text === saved;
  return {
    length,
    max: MAX_NOTE_LENGTH,
    tooLong,
    empty,
    unchanged,
    canSave: !tooLong && !empty && !unchanged,
  };
}
