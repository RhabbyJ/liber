import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateSellerPropertySchema } from "@liber/validators";
import { normalizeInput } from "./normalize-input";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  auditRows: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  auditCreate: vi.fn(),
  buyerProfile: vi.fn(),
  invites: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@liber/db", async () => ({
  Prisma: (await import("../../../packages/db/src/generated/client")).Prisma,
  prisma: {
    sellerProperty: { findFirst: mocks.findFirst, findMany: mocks.findMany, create: mocks.create },
    adminAuditLog: { findMany: mocks.auditRows, create: mocks.auditCreate },
    $transaction: mocks.transaction,
    $queryRaw: mocks.query,
    buyerProfile: { findUnique: mocks.buyerProfile },
    invite: { findMany: mocks.invites },
  },
}));
vi.mock("./session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));

import { createSellerProperty, getSellerProperty, listBuyerInvites, listSellerProperties, updateSellerProperty } from "./contracts";

const property = {
  id: "property-fixture",
  ownerUserId: "seller-fixture",
  addressLine1: "120 Test Avenue",
  addressLine2: "Unit 2B",
  city: "Los Angeles",
  state: "CA",
  zip: "91325",
  lat: { toString: () => "34.2339231" },
  lng: { toString: () => "-118.5192794" },
  condition: "Move-in ready",
  description: "Synthetic test property",
  features: [],
  garageArea: null,
  lotSize: 6000,
  ownershipVerificationStatus: "APPROVED",
  status: "READY_FOR_INVITES",
  identityVersion: 3,
  price: 700000,
  propertyType: "HOME",
  squareFeet: 1800,
  bedrooms: 3,
  bathrooms: 2,
};

describe("owner property edit defaults", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "seller-fixture", roles: ["SELLER"] });
    mocks.findFirst.mockResolvedValue(property);
    mocks.findMany.mockResolvedValue([property]);
    mocks.auditRows.mockResolvedValue([]);
    mocks.create.mockResolvedValue(property);
    mocks.update.mockResolvedValue(property);
    mocks.transaction.mockImplementation(async (operation) => operation({ sellerProperty: { findFirst: mocks.findFirst, update: mocks.update } }));
  });

  it("never represents a synthetic property approval as verified ownership", async () => {
    mocks.auditRows.mockResolvedValue([{ action: "property_synthetic_test_approval", targetId: property.id, metadata: { propertyIdentityVersion: 3 } }]);
    expect((await getSellerProperty(property.id)).data.status).toBe("Test approval — ownership not verified");
    expect((await listSellerProperties()).data[0]?.status).toBe("Test approval — ownership not verified");
  });

  it("preserves the full canonical address through the HTML update contract", async () => {
    const result = await getSellerProperty(property.id);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      include: { images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, propertyIdentityVersion: true } } },
      where: { id: property.id, ownerUserId: "seller-fixture" },
    });
    expect(result.data.address).toEqual({
      addressLine1: property.addressLine1,
      addressLine2: property.addressLine2,
      city: property.city,
      state: property.state,
      zip: property.zip,
      lat: "34.2339231",
      lng: "-118.5192794",
    });

    const form = new FormData();
    for (const [key, value] of Object.entries(result.data.address)) {
      if (value !== undefined) form.set(key, value);
    }
    form.set("propertyId", property.id);
    form.set("ownershipConfirmed", "true");
    expect(updateSellerPropertySchema.parse(normalizeInput(form))).toMatchObject({
      addressLine1: property.addressLine1,
      addressLine2: property.addressLine2,
      city: property.city,
      state: property.state,
      zip: property.zip,
      lat: 34.2339231,
      lng: -118.5192794,
    });
  });

  it("leaves absent address values blank instead of using display titles or zero coordinates", async () => {
    mocks.findFirst.mockResolvedValue({
      ...property, addressLine1: null, addressLine2: null, city: null, state: null, zip: null, lat: null, lng: null,
    });
    const result = await getSellerProperty(property.id);
    expect(Object.values(result.data.address).every((value) => value === undefined)).toBe(true);
    expect(result.data.title).not.toBe("");
  });

  it("preserves legitimate zero coordinates", async () => {
    mocks.findFirst.mockResolvedValue({ ...property, lat: 0, lng: 0 });
    expect((await getSellerProperty(property.id)).data.address).toMatchObject({ lat: "0", lng: "0" });
  });

  it("does not expand the shared property summary with edit-only address data", async () => {
    const result = await listSellerProperties();
    expect(result.data[0]).not.toHaveProperty("address");
    expect(result.data[0]).not.toHaveProperty("addressLine2");
    expect(result.data[0]).not.toHaveProperty("lat");
    expect(result.data[0]).not.toHaveProperty("lng");
    expect(result.data[0]).not.toHaveProperty("ownerUserId");
    expect(result.data[0]).not.toHaveProperty("garageArea");
  });

  it("saves checkbox features and condition without writing retired garage size", async () => {
    const form = new FormData();
    form.set("propertyType", "HOME");
    form.set("ownershipConfirmed", "true");
    form.set("condition", "Mild fixer");
    form.set("garageArea", "400");
    form.append("features", "");
    form.append("features", "Pool");
    form.append("features", "Fireplace");
    await createSellerProperty(form);
    const written = mocks.create.mock.calls[0][0].data;
    expect(written).toMatchObject({ condition: "Mild fixer", features: ["Pool", "Fireplace"] });
    expect(written).not.toHaveProperty("garageArea");
  });

  it("clears every feature and condition when their form controls are cleared", async () => {
    const form = new FormData();
    form.set("propertyId", property.id);
    form.set("ownershipConfirmed", "true");
    form.set("condition", "");
    form.set("features", "");
    await updateSellerProperty(form);
    const written = mocks.update.mock.calls[0][0].data;
    expect(written).toMatchObject({ condition: "", features: [] });
    expect(written).not.toHaveProperty("garageArea");
  });

  it("preserves historical custom condition and checkbox feature labels on edit", () => {
    const form = new FormData();
    form.set("propertyId", property.id);
    form.set("ownershipConfirmed", "true");
    form.set("condition", "Well maintained");
    form.append("features", "");
    form.append("features", "Fireplace");
    form.append("features", "Original wood beams");
    form.append("features", "Patio, covered");
    expect(updateSellerPropertySchema.parse(normalizeInput(form))).toMatchObject({
      condition: "Well maintained", features: ["Fireplace", "Original wood beams", "Patio, covered"],
    });
  });

  it("shares property features only on the current identity of the buyer's authorized invite", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "buyer-fixture", roles: ["BUYER"] });
    mocks.buyerProfile.mockResolvedValue({ id: "profile-fixture" });
    mocks.query.mockResolvedValue([{ id: "invite-fixture" }]);
    const invite = {
      id: "invite-fixture", buyerProfileId: "profile-fixture", sellerId: "seller-fixture",
      buyerProfile: { displayName: "Laurel Hearth", userId: "buyer-fixture" },
      propertyId: property.id, propertyIdentityVersion: property.identityVersion,
      property: { ...property, features: ["Pool", "Fireplace"] },
      sentAt: new Date("2026-09-27T12:00:00Z"), expiresAt: null, status: "ACCEPTED", title: "Private invite", message: "View this property",
    };
    mocks.invites.mockResolvedValue([invite]);
    expect((await listBuyerInvites()).data[0]).toMatchObject({ propertyCondition: "Move-in ready", propertyFeatures: ["Pool", "Fireplace"] });
    expect(mocks.invites.mock.calls[0][0].where).toEqual({ id: { in: ["invite-fixture"] } });

    mocks.invites.mockResolvedValue([{ ...invite, propertyIdentityVersion: property.identityVersion - 1 }]);
    expect((await listBuyerInvites()).data[0]).toMatchObject({ propertyCondition: undefined, propertyFeatures: [] });
  });

  it("requires a seller session before querying the property", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    await expect(getSellerProperty(property.id)).rejects.toThrow("redirect:/login");
    mocks.getSessionUser.mockResolvedValue({ id: "other-fixture", roles: ["BUYER"] });
    await expect(getSellerProperty(property.id)).rejects.toThrow("redirect:");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("returns no address when the owner-scoped property lookup fails", async () => {
    mocks.getSessionUser.mockResolvedValue({ id: "other-seller-fixture", roles: ["SELLER"] });
    mocks.findFirst.mockResolvedValue(null);
    await expect(getSellerProperty(property.id)).rejects.toThrow("Property not found.");
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: property.id, ownerUserId: "other-seller-fixture" } }));
  });
});
