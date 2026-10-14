import { normalizeServiceAreaQuery } from "./service-area-search";

export type HighlightSegment = { match: boolean; text: string };

const WORD = /[\p{L}\p{N}]+/gu;

function fold(value: string) {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Mark the leading part of each word that a query token prefixes, e.g.
 * "hills" in "Granada Hills". Typo-tolerant matches simply render unmarked.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const tokens = normalizeServiceAreaQuery(query).split(" ").filter(Boolean);
  if (tokens.length === 0 || !text) return [{ match: false, text }];

  const ranges: Array<[number, number]> = [];
  for (const word of text.matchAll(WORD)) {
    const folded = fold(word[0]);
    const token = tokens
      .filter((candidate) => folded.startsWith(candidate))
      .sort((left, right) => right.length - left.length)[0];
    if (!token) continue;
    let consumed = 0;
    let length = 0;
    for (const character of word[0]) {
      if (consumed >= token.length) break;
      consumed += fold(character).length;
      length += character.length;
    }
    ranges.push([word.index, word.index + length]);
  }
  if (ranges.length === 0) return [{ match: false, text }];

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) segments.push({ match: false, text: text.slice(cursor, start) });
    segments.push({ match: true, text: text.slice(start, end) });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ match: false, text: text.slice(cursor) });
  return segments;
}
