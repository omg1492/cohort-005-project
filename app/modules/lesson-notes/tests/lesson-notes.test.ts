import { describe, it, expect } from "vitest";
import { noteBodySchema, noteDraft } from "../index";
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
    expect(noteDraft("")).toMatchObject({
      empty: true,
      tooLong: false,
      canSave: false,
    });
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
      empty: false,
      canSave: false,
    });
  });

  it("refuses to save a note that matches the saved one", () => {
    expect(noteDraft("my note", "my note")).toMatchObject({
      unchanged: true,
      canSave: false,
    });
  });

  it("treats whitespace at the ends as no change, as the server trims it", () => {
    expect(noteDraft("  my note \n", "my note")).toMatchObject({
      unchanged: true,
      canSave: false,
    });
  });

  it("treats a blank box as unchanged when nothing is saved yet", () => {
    expect(noteDraft("")).toMatchObject({ unchanged: true, canSave: false });
  });

  it("allows saving an edit to the saved note", () => {
    expect(noteDraft("my note, edited", "my note")).toMatchObject({
      unchanged: false,
      canSave: true,
    });
  });
});

describe("noteBodySchema", () => {
  it("stores the note trimmed", () => {
    expect(noteBodySchema.parse("  my note \n")).toBe("my note");
  });

  it("refuses a whitespace-only note, saying what to do", () => {
    const parsed = noteBodySchema.safeParse(" \n ");
    expect(parsed.error?.issues[0]?.message).toBe(
      "Write something before saving your note."
    );
  });

  it("refuses a note over the limit, saying it was not saved", () => {
    const parsed = noteBodySchema.safeParse("a".repeat(MAX_NOTE_LENGTH + 1));
    expect(parsed.error?.issues[0]?.message).toBe(
      "Your note is over 2,000 characters, so it was not saved."
    );
  });
});
