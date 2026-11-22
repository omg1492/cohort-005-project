import { describe, it, expect } from "vitest";
import { noteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("noteDraft", () => {
  it("counts the characters against the note limit", () => {
    const draft = noteDraft("Generics are like functions for types");
    expect(draft.length).toBe(37);
    expect(draft.max).toBe(MAX_NOTE_LENGTH);
  });

  it("does not count whitespace at either end, as the server trims it", () => {
    expect(noteDraft("  hi \n").length).toBe(2);
    expect(noteDraft(` ${"a".repeat(MAX_NOTE_LENGTH)} `).canSave).toBe(true);
  });

  it("allows saving a note with text in it", () => {
    expect(noteDraft("remember to try strict mode")).toMatchObject({
      empty: false,
      tooLong: false,
      canSave: true,
    });
  });

  it("refuses to save an empty or whitespace-only note", () => {
    expect(noteDraft("")).toMatchObject({ empty: true, canSave: false });
    expect(noteDraft("   \n\t")).toMatchObject({ empty: true, canSave: false });
  });

  it("allows a note exactly at the limit", () => {
    expect(noteDraft("a".repeat(MAX_NOTE_LENGTH))).toMatchObject({
      tooLong: false,
      canSave: true,
    });
  });

  it("refuses a note one character over the limit", () => {
    expect(noteDraft("a".repeat(MAX_NOTE_LENGTH + 1))).toMatchObject({
      tooLong: true,
      canSave: false,
    });
  });
});
