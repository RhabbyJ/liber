import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  audit: vi.fn(),
  criteriaUpsert: vi.fn(),
  findProfile: vi.fn(),
  findArea: vi.fn(),
  profileUpdate: vi.fn(),
  profileUpsert: vi.fn(),
  queryRaw: vi.fn(),
  quarantineUpdate: vi.fn(),
  selectionCreate: vi.fn(),
  selectionDelete: vi.fn(),
  session: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@liber/db", async () => {
  const { Prisma } = await import("../../../../packages/db/src/generated/client");
  return { Prisma, prisma: { $transaction: db.transaction } };
});
vi.mock("../session", () => ({ getSessionUser: db.session }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));

import { Prisma } from "@liber/db";
import { saveBuyerProfile } from "./commands";
import { publicNameForDisplay } from "../public-identity";

const userId = "11111111-1111-4111-8111-111111111111";
const profileId = "buyer-profile-1";
const owner = { id: userId, roles: ["BUYER"], status: "ACTIVE" };
const existing = { displayName: "Maple Haven", id: profileId, visibilityStatus: "ACTIVE" };

function profileForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    buyerType: "Cash",
    buyingPurpose: "House",
    budgetMin: "700000",
    budgetMax: "900000",
    desiredMarketSlug: "los-angeles",
    desiredServiceAreaSlug: "91325",
  })) form.set(key, value);
  return form;
}

it("stores only the server-owned limited identity and ignores client identity fields", async () => {
  db.session.mockResolvedValue({ id: userId, name: "Julie PrivateSurname", roles: ["BUYER"] });
  const form = profileForm();
  form.set("displayName", "Client ForgedIdentity");
  await saveBuyerProfile(form);
  const write = db.profileUpsert.mock.calls[0][0];
  expect(write.create.displayName).toBe(publicNameForDisplay("Julie PrivateSurname", userId));
  expect(write.update.displayName).toBe(write.create.displayName);
  expect(write.update.displayName).not.toContain("PrivateSurname");
});

beforeEach(() => {
  vi.resetAllMocks();
  db.session.mockResolvedValue(owner);
  db.queryRaw.mockResolvedValue([owner]);
  db.findProfile.mockResolvedValue(existing);
  db.findArea.mockResolvedValue({
    centerLat: 34.2,
    centerLng: -118.5,
    city: "Northridge",
    id: "area-1",
    label: "91325",
    market: { slug: "los-angeles" },
    postalCode: "91325",
    slug: "91325",
    state: "CA",
    type: "zip",
  });
  db.profileUpsert.mockResolvedValue({ id: profileId });
  db.transaction.mockImplementation(async (operation) => operation({
    $queryRaw: db.queryRaw,
    adminAuditLog: { create: db.audit },
    buyerCriteria: { upsert: db.criteriaUpsert },
    buyerDesiredServiceArea: { create: db.selectionCreate, deleteMany: db.selectionDelete },
    buyerProfile: { findUnique: db.findProfile, update: db.profileUpdate, upsert: db.profileUpsert },
    serviceArea: { findFirst: db.findArea },
    serviceAreaMigrationQuarantine: { updateMany: db.quarantineUpdate },
  }));
});

describe("buyer profile aggregate save", () => {
  it("clears persisted optional preferences when the full form is submitted blank", async () => {
    const form = profileForm();
    const profileFields = ["bio", "downPaymentMin", "downPaymentMax"];
    const criteriaFields = [
      "bathroomsMin", "bedroomsMin", "condition", "lotSizeMax", "lotSizeMin",
      "squareFeetMax", "squareFeetMin", "yearBuiltMin",
    ];
    for (const field of [...profileFields, ...criteriaFields]) form.set(field, "");

    await saveBuyerProfile(form);

    const profile = db.profileUpsert.mock.calls[0][0].update;
    const criteria = db.criteriaUpsert.mock.calls[0][0].update;
    for (const field of profileFields) expect(profile[field], field).toBeNull();
    for (const field of criteriaFields) expect(criteria[field], field).toBeNull();
    expect(criteria.features).toEqual([]);
    expect(profile).toMatchObject({ budgetMin: 700000, budgetMax: 900000 });
    expect(criteria).toMatchObject({ priceMin: 700000, priceMax: 900000 });
  });

  it("preserves explicit zero values and commits publication after criteria and location", async () => {
    const form = profileForm();
    form.set("downPaymentMin", "0");
    form.set("bedroomsMin", "0");
    form.set("bathroomsMin", "0");

    await saveBuyerProfile(form);

    expect(db.profileUpsert.mock.calls[0][0].update.downPaymentMin).toBe(0);
    expect(db.criteriaUpsert.mock.calls[0][0].update).toMatchObject({ bedroomsMin: 0, bathroomsMin: 0 });
    expect(db.profileUpdate).toHaveBeenCalledWith({
      where: { id: profileId }, data: { visibilityStatus: "ACTIVE" },
    });
    expect(db.profileUpdate.mock.invocationCallOrder[0]).toBeGreaterThan(db.criteriaUpsert.mock.invocationCallOrder[0]);
    expect(db.profileUpdate.mock.invocationCallOrder[0]).toBeGreaterThan(db.selectionCreate.mock.invocationCallOrder[0]);
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("clears omitted draft budgets together with the corresponding criteria prices", async () => {
    const form = new FormData();
    await saveBuyerProfile(form, "DRAFT");

    expect(db.profileUpsert.mock.calls[0][0].update).toMatchObject({
      budgetMin: null, budgetMax: null, buyerType: null, buyingPurpose: null,
      desiredCity: null, desiredLat: null, desiredLng: null, visibilityStatus: "DRAFT",
    });
    expect(db.criteriaUpsert.mock.calls[0][0].update).toMatchObject({ priceMin: null, priceMax: null });
    expect(db.profileUpdate).not.toHaveBeenCalled();
  });

  it.each([existing, null])("locks the owning account before looking up an existing or first profile: %o", async (profile) => {
    db.findProfile.mockResolvedValue(profile);
    await saveBuyerProfile(profileForm());

    const [parts, lockedUserId] = db.queryRaw.mock.calls[0];
    expect(parts.join("")).toContain('FROM public."User"');
    expect(parts.join("")).toContain("FOR UPDATE");
    expect(lockedUserId).toBe(userId);
    expect(db.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.findProfile.mock.invocationCallOrder[0]);
  });

  it.each([
    { rows: [] },
    { rows: [{ ...owner, status: "SUSPENDED" }] },
    { rows: [{ ...owner, roles: ["SELLER"] }] },
  ])("rejects stale session authorization under the account lock: %o", async ({ rows }) => {
    db.queryRaw.mockResolvedValue(rows);
    await expect(saveBuyerProfile(profileForm())).rejects.toThrow("Buyer account is no longer active or authorized.");
    expect(db.findProfile).not.toHaveBeenCalled();
    expect(db.profileUpsert).not.toHaveBeenCalled();
  });

  it("does not republish an admin-hidden profile", async () => {
    db.findProfile.mockResolvedValue({ ...existing, visibilityStatus: "HIDDEN" });
    await expect(saveBuyerProfile(profileForm())).rejects.toThrow("controlled by admin review");
    expect(db.profileUpsert).not.toHaveBeenCalled();
  });

  it("rechecks authorization on a serialization retry", async () => {
    db.findProfile.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("conflict", {
      code: "P2034", clientVersion: "test",
    }));
    db.queryRaw.mockResolvedValueOnce([owner]).mockResolvedValueOnce([{ ...owner, status: "SUSPENDED" }]);

    await expect(saveBuyerProfile(profileForm())).rejects.toThrow("Buyer account is no longer active or authorized.");
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(db.profileUpsert).not.toHaveBeenCalled();
  });
});
