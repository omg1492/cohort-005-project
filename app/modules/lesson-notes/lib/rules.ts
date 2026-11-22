import { z } from "zod";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

// The server trims before it checks the limit and before it stores the note.
export const noteText = z.string().trim();

export const noteBody = noteText
  .min(1, "Write something before saving your note.")
  .max(
    MAX_NOTE_LENGTH,
    `Your note is over ${MAX_NOTE_LENGTH.toLocaleString("en")} characters, so it was not saved.`
  );
