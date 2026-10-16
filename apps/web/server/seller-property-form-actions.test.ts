import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialSellerPropertyFormState } from "../lib/seller-property-form";

const mocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  auditRows: vi.fn(),
  create: vi.fn(),
  findFirst: vi.fn(),
  getSessionUser: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@liber/db", async () => ({
  Prisma: (await import("../../../packages/db/src/generated/client")).Prisma,
  prisma: {
    $transaction: mocks.transaction,
    adminAuditLog: { create: mocks.auditCreate, findMany: mocks.auditRows },
    sellerProperty: { create: mocks.create },
  },
}));
vi.mock("./session", async () => (await import("./session-mock.test-helper")).sessionModuleMock(mocks.getSessionUser));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));

import { submitSellerProperty, submitSellerPropertyUpdate } from "./form-actions";

const savedProperty = {
  id: "property-fixture",
  features: [],
  identityVersion: 1,
  ownerUserId: "seller-fixture",
  ownershipVerificationStatus: "NOT_SUBMITTED",
  propertyType: "HOME",
  status: "DRAFT",
};

function propertyForm(values: Record<string, string>) {
  const form = new FormData();
  form.set("propertyType", "HOME");
  form.set("ownershipConfirmed", "true");
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("seller property form actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "seller-fixture", roles: ["SELLER"] });
    mocks.create.mockResolvedValue(savedProperty);
    mocks.findFirst.mockResolvedValue({ id: savedProperty.id });
    mocks.update.mockResolvedValue(savedProperty);
    mocks.auditRows.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (operation) => operation({
      sellerProperty: { findFirst: mocks.findFirst, update: mocks.update },
    }));
  });

  it("saves the formatted numbers sellers type", async () => {
    const form = propertyForm({ bathrooms: "2", bedrooms: "4", lotSize: "7 200", price: "$925,000", squareFeet: "2,140" });

    await expect(submitSellerProperty(initialSellerPropertyFormState, form)).rejects.toThrow(
      "redirect:/seller/properties/property-fixture/edit",
    );
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      bathrooms: 2,
      bedrooms: 4,
      lotSize: 7200,
      price: 925000,
      squareFeet: 2140,
    });
  });

  it("returns field errors instead of crashing on numbers it cannot store", async () => {
    const form = propertyForm({ bathrooms: "2.5", price: "925k", squareFeet: "2,14" });

    const state = await submitSellerProperty(initialSellerPropertyFormState, form);

    expect(state).toEqual({
      fieldErrors: {
        bathrooms: "Enter bathrooms as a whole number, like 2. Half baths can't be saved.",
        price: "Enter the asking price in dollars, like 925,000.",
        squareFeet: "Enter square feet as a whole number, like 2,140.",
      },
      message: "Check the highlighted fields and try again.",
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps edits on the form with field errors and saves corrected formatted input", async () => {
    const invalid = propertyForm({ propertyId: savedProperty.id, squareFeet: "2,140.5" });
    expect((await submitSellerPropertyUpdate(initialSellerPropertyFormState, invalid)).fieldErrors).toEqual({
      squareFeet: "Enter square feet as a whole number, like 2,140.",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();

    const corrected = propertyForm({ price: "$1,250,000", propertyId: savedProperty.id, squareFeet: "2,140" });
    await expect(submitSellerPropertyUpdate(initialSellerPropertyFormState, corrected)).rejects.toThrow(
      "redirect:/seller/properties",
    );
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ price: 1250000, squareFeet: 2140 });
  });

  it("explains a property that is no longer the seller's", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const state = await submitSellerPropertyUpdate(
      initialSellerPropertyFormState,
      propertyForm({ propertyId: "someone-elses-property" }),
    );

    expect(state.message).toBe("This property is no longer available to your account. Return to your properties and try again.");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("still sends signed-out sellers to login instead of returning form copy", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    await expect(submitSellerProperty(initialSellerPropertyFormState, propertyForm({ bathrooms: "2.5" }))).rejects.toThrow(
      "redirect:/login",
    );
  });
});
