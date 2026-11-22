export type NoteDraft = {
  length: number;
  max: number;
  tooLong: boolean;
  empty: boolean;
  canSave: boolean;
};

// The server trims before it checks the limit, so whitespace at the ends
// neither counts nor makes an otherwise empty note savable.
export function describeDraft(body: string, max: number): NoteDraft {
  const length = body.trim().length;
  const tooLong = length > max;
  const empty = length === 0;
  return { length, max, tooLong, empty, canSave: !tooLong && !empty };
}
