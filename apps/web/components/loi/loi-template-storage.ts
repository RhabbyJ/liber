import { LOI_TEMPLATE_LIMIT, parseLoiTemplate, parseLoiTemplates, type LoiTemplate } from "./loi-template-values";

export const LOI_TEMPLATE_STORAGE_PREFIX = "liber.loi-templates.v1:";
export { LOI_TEMPLATE_LIMIT } from "./loi-template-values";
export type LoiTemplateStorage = Pick<Storage, "getItem" | "setItem">;
type Failure = { ok: false; error: string };
type ReadResult = { ok: true; templates: LoiTemplate[] } | Failure;
type SaveResult = { ok: true; templates: LoiTemplate[]; saved: LoiTemplate } | Failure;

export function loiTemplateStorageKey(ownerId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId)) throw new Error("A signed-in owner is required for LOI templates.");
  return `${LOI_TEMPLATE_STORAGE_PREFIX}${ownerId}`;
}

export function readLoiTemplates(storage: LoiTemplateStorage | null, ownerId: string): ReadResult {
  if (!storage) return { ok: false, error: "Browser storage is unavailable. Enable it to use saved templates." };
  let raw: string | null;
  try { raw = storage.getItem(loiTemplateStorageKey(ownerId)); }
  catch { return { ok: false, error: "Saved templates could not be read in this browser." }; }
  if (raw === null) return { ok: true, templates: [] };
  try {
    const templates = parseLoiTemplates(raw);
    if (new Set(templates.map((item) => item.name.toLocaleLowerCase("en-US"))).size !== templates.length) throw new Error("Duplicate template names");
    return { ok: true, templates };
  }
  catch { return { ok: false, error: "Saved template data could not be opened. It has been preserved; saving is blocked to avoid replacing it." }; }
}

function persist(storage: LoiTemplateStorage, ownerId: string, templates: LoiTemplate[]): Failure | null {
  try {
    // Validate the bounded collection again before changing browser data.
    const serialized = JSON.stringify(parseLoiTemplates(templates));
    const key = loiTemplateStorageKey(ownerId);
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) return { ok: false, error: "The browser could not confirm that the template change was saved." };
    return null;
  } catch { return { ok: false, error: "The template change could not be saved. Browser storage may be disabled or full." }; }
}

export function saveLoiTemplate(storage: LoiTemplateStorage | null, ownerId: string, input: LoiTemplate): SaveResult {
  const latest = readLoiTemplates(storage, ownerId);
  if (!latest.ok) return latest;
  let template: LoiTemplate;
  try { template = parseLoiTemplate(input); }
  catch { return { ok: false, error: "This template is not valid and could not be saved." }; }
  const existing = latest.templates.find((item) => item.name.toLocaleLowerCase("en-US") === template.name.toLocaleLowerCase("en-US"));
  if (!existing && latest.templates.some((item) => item.id === template.id)) return { ok: false, error: "This template identifier is already in use. Try saving again." };
  const saved = existing ? { ...template, id: existing.id, createdAt: existing.createdAt } : template;
  const templates = [saved, ...latest.templates.filter((item) => item.id !== saved.id)];
  if (templates.length > LOI_TEMPLATE_LIMIT) return { ok: false, error: "You can save up to 20 templates. Remove a template before adding another." };
  const error = persist(storage!, ownerId, templates);
  return error ?? { ok: true, templates, saved };
}

export function removeLoiTemplate(storage: LoiTemplateStorage | null, ownerId: string, id: string): ReadResult {
  const latest = readLoiTemplates(storage, ownerId);
  if (!latest.ok) return latest;
  const templates = latest.templates.filter((item) => item.id !== id);
  if (templates.length === latest.templates.length) return { ok: false, error: "This template was already removed. Reopen the list to see the latest templates." };
  const error = persist(storage!, ownerId, templates);
  return error ?? { ok: true, templates };
}
