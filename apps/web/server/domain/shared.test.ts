import { describe, expect, it, vi } from "vitest";

vi.mock("@liber/db", () => ({ prisma: {} }));
vi.mock("../session", () => ({ getSessionUser: vi.fn() }));

import { ADMIN_PAGE_SIZE, cursorPage, cursorPageArgs, InvalidPageCursorError } from "./shared";

describe("admin cursor pages", () => {
  it("asks for one extra row and starts after the cursor row", () => {
    expect(cursorPageArgs(undefined, "rowId")).toEqual({ take: ADMIN_PAGE_SIZE + 1 });
    expect(cursorPageArgs("cm1abc_DEF-2", "rowId")).toEqual({ cursor: { id: "cm1abc_DEF-2" }, skip: 1, take: 51 });
    expect(cursorPageArgs("22222222-2222-4222-8222-222222222222", "uuid", 10)).toEqual({
      cursor: { id: "22222222-2222-4222-8222-222222222222" }, skip: 1, take: 11,
    });
  });

  it.each([
    ["rowId", ""],
    ["rowId", "has space"],
    ["rowId", "x".repeat(201)],
    ["rowId", "../admin"],
    ["uuid", "not-a-uuid"],
    ["uuid", "22222222-2222-4222-8222-22222222222"],
  ] as const)("rejects a malformed %s cursor %j", (format, cursor) => {
    expect(() => cursorPageArgs(cursor, format)).toThrow(InvalidPageCursorError);
  });

  it("returns the page and the last row id only when another page exists", () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({ id: `row-${index}` }));
    expect(cursorPage(rows, 3)).toEqual({ items: rows.slice(0, 3), nextCursor: "row-2" });
    expect(cursorPage(rows.slice(0, 3), 3)).toEqual({ items: rows.slice(0, 3), nextCursor: null });
    expect(cursorPage([], 3)).toEqual({ items: [], nextCursor: null });
  });
});
