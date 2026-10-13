import { describe, expect, it } from "vitest";
import { createLoiTemplate, type LoiTemplate } from "./loi-template-values";
import { loiTemplateStorageKey, readLoiTemplates, removeLoiTemplate, saveLoiTemplate } from "./loi-template-storage";
import { cashTerms } from "./loi-test-fixtures.test-helper";

const owner = "00000000-0000-4000-8000-000000000001";
const otherOwner = "00000000-0000-4000-8000-000000000002";
const now = "2026-10-06T22:00:00.000Z";
class MemoryStorage {
  values = new Map<string, string>();
  writes = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes++; this.values.set(key, value); }
}
const template = (index: number, name = `Template ${index}`, date = now) => createLoiTemplate({ id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, name, terms: cashTerms, now: date });

describe("account-scoped browser LOI template storage", () => {
  it("persists templates only under the signed-in account's key", () => {
    const storage = new MemoryStorage();
    expect(readLoiTemplates(storage, owner)).toEqual({ ok: true, templates: [] });
    expect(saveLoiTemplate(storage, owner, template(1)).ok).toBe(true);
    expect(readLoiTemplates(storage, otherOwner)).toEqual({ ok: true, templates: [] });
    expect([...storage.values.keys()]).toEqual([loiTemplateStorageKey(owner)]);
    expect(readLoiTemplates(storage, owner)).toMatchObject({ ok: true, templates: [{ name: "Template 1" }] });
  });

  it("reloads storage before saving and preserves unrelated templates added in another tab", () => {
    const storage = new MemoryStorage();
    readLoiTemplates(storage, owner);
    storage.values.set(loiTemplateStorageKey(owner), JSON.stringify([template(2)]));
    expect(saveLoiTemplate(storage, owner, template(1))).toMatchObject({ ok: true, templates: [{ name: "Template 1" }, { name: "Template 2" }] });
  });

  it("updates names without regard to case while preserving ID and creation date", () => {
    const storage = new MemoryStorage();
    const original = template(1, "Standard offer", "2026-10-05T22:00:00.000Z");
    expect(saveLoiTemplate(storage, owner, original).ok).toBe(true);
    const result = saveLoiTemplate(storage, owner, template(2, "STANDARD OFFER"));
    expect(result).toMatchObject({ ok: true, saved: { id: original.id, createdAt: original.createdAt, updatedAt: now, name: "STANDARD OFFER" }, templates: [{ id: original.id }] });
    if (result.ok) expect(result.templates).toHaveLength(1);
  });

  it("limits new templates to twenty while allowing an existing name to be updated", () => {
    const storage = new MemoryStorage();
    storage.values.set(loiTemplateStorageKey(owner), JSON.stringify(Array.from({ length: 20 }, (_, index) => template(index + 1))));
    const before = storage.getItem(loiTemplateStorageKey(owner));
    expect(saveLoiTemplate(storage, owner, template(21))).toMatchObject({ ok: false, error: expect.stringContaining("20 templates") });
    expect(storage.getItem(loiTemplateStorageKey(owner))).toBe(before);
    expect(saveLoiTemplate(storage, owner, template(21, "Template 1")).ok).toBe(true);
  });

  it.each(["not JSON", "{}", '[{"schemaVersion":999}]', "[" + " ".repeat(128 * 1024) + "]"])("preserves malformed, unknown, or oversized data and blocks saving: %#", (raw) => {
    const storage = new MemoryStorage();
    storage.values.set(loiTemplateStorageKey(owner), raw);
    expect(readLoiTemplates(storage, owner)).toMatchObject({ ok: false });
    expect(saveLoiTemplate(storage, owner, template(1))).toMatchObject({ ok: false });
    expect(removeLoiTemplate(storage, owner, template(1).id)).toMatchObject({ ok: false });
    expect(storage.getItem(loiTemplateStorageKey(owner))).toBe(raw);
    expect(storage.writes).toBe(0);
  });

  it("rejects duplicate names and IDs without silently replacing saved data", () => {
    const storage = new MemoryStorage();
    for (const items of [[template(1, "Name"), template(2, "NAME")], [template(1), template(1)]]) {
      const raw = JSON.stringify(items);
      storage.values.set(loiTemplateStorageKey(owner), raw);
      expect(saveLoiTemplate(storage, owner, template(3))).toMatchObject({ ok: false });
      expect(storage.getItem(loiTemplateStorageKey(owner))).toBe(raw);
    }
    expect(storage.writes).toBe(0);
  });

  it("reports unavailable storage, blocked reads, quota failures, and unconfirmed writes without success", () => {
    expect(saveLoiTemplate(null, owner, template(1))).toMatchObject({ ok: false });
    const blocked = { getItem: () => { throw new Error("Disabled"); }, setItem: () => undefined };
    expect(readLoiTemplates(blocked, owner)).toMatchObject({ ok: false });
    const full = { getItem: () => null, setItem: () => { throw new Error("Quota exceeded"); } };
    expect(saveLoiTemplate(full, owner, template(1))).toMatchObject({ ok: false });
    const ignored = { getItem: () => null, setItem: () => undefined };
    expect(saveLoiTemplate(ignored, owner, template(1))).toMatchObject({ ok: false, error: expect.stringContaining("confirm") });
  });

  it("removes only the confirmed template and preserves another account's storage", () => {
    const storage = new MemoryStorage();
    saveLoiTemplate(storage, owner, template(1));
    saveLoiTemplate(storage, owner, template(2));
    saveLoiTemplate(storage, otherOwner, template(3));
    expect(removeLoiTemplate(storage, owner, template(1).id)).toMatchObject({ ok: true, templates: [{ id: template(2).id }] });
    expect(readLoiTemplates(storage, otherOwner)).toMatchObject({ ok: true, templates: [{ id: template(3).id }] });
  });

  it("rejects invalid owners, unsupported incoming schemas, and conflicting IDs", () => {
    const storage = new MemoryStorage();
    expect(saveLoiTemplate(storage, "", template(1))).toMatchObject({ ok: false });
    expect(saveLoiTemplate(storage, owner, { ...template(1), schemaVersion: 999 } as unknown as LoiTemplate)).toMatchObject({ ok: false });
    expect(storage.writes).toBe(0);
    saveLoiTemplate(storage, owner, template(1));
    expect(saveLoiTemplate(storage, owner, template(1, "Different name"))).toMatchObject({ ok: false });
    expect(readLoiTemplates(storage, owner)).toMatchObject({ ok: true, templates: [{ name: "Template 1" }] });
  });
});
