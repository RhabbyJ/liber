import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  elevate: vi.fn(),
  findUnique: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@liber/db", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("./supabase", () => ({ createSupabaseServerClient: mocks.createClient }));
vi.mock("./ceo-preview", () => ({ ensureCeoPreviewDemoPrivileges: mocks.elevate }));

import { getSessionUser } from "./session";

const userId = "11111111-1111-4111-8111-111111111111";
const databaseUser = {
  avatarVariant: "avatarka:animals:7",
  email: "buyer@example.test",
  name: "Private account name",
  roles: ["BUYER"],
  status: "ACTIVE",
};

describe("validated application session", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("LIBER_CEO_PREVIEW_TARGET", "");
    vi.stubEnv("LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL", "");
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: userId, email: "BUYER@example.test", user_metadata: { roles: ["ADMIN"], name: "Changed metadata" } } },
      error: null,
    });
    mocks.findUnique.mockResolvedValue(databaseUser);
    mocks.elevate.mockResolvedValue({ roles: ["BUYER", "ADMIN"] });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("uses the verified UUID and database identity and roles instead of editable metadata", async () => {
    await expect(getSessionUser()).resolves.toEqual({
      avatarVariant: databaseUser.avatarVariant,
      email: databaseUser.email,
      id: userId,
      name: databaseUser.name,
      roles: ["BUYER"],
    });
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: userId } }));
    expect(mocks.elevate).not.toHaveBeenCalled();
  });

  it.each([
    ["missing identity", null],
    ["suspended identity", { ...databaseUser, status: "SUSPENDED" }],
    ["email mismatch", { ...databaseUser, email: "someone-else@example.test" }],
  ])("rejects %s even when preview elevation is enabled", async (_name, row) => {
    vi.stubEnv("LIBER_CEO_PREVIEW_TARGET", "ceo-preview");
    vi.stubEnv("LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL", "true");
    mocks.findUnique.mockResolvedValue(row);

    await expect(getSessionUser()).resolves.toBeNull();
    expect(mocks.elevate).not.toHaveBeenCalled();
  });

  it("rejects an unverified Auth response before querying application identity", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: { message: "Invalid session" } });

    await expect(getSessionUser()).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["", "true"],
    ["production", "true"],
    ["ceo-preview", ""],
    ["ceo-preview", "TRUE"],
  ])("does not elevate with target %j and flag %j", async (target, enabled) => {
    vi.stubEnv("LIBER_CEO_PREVIEW_TARGET", target);
    vi.stubEnv("LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL", enabled);

    await expect(getSessionUser()).resolves.toMatchObject({ roles: ["BUYER"] });
    expect(mocks.elevate).not.toHaveBeenCalled();
  });

  it("uses server-controlled preview elevation only with both exact opt-in values", async () => {
    vi.stubEnv("LIBER_CEO_PREVIEW_TARGET", "ceo-preview");
    vi.stubEnv("LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL", "true");

    await expect(getSessionUser()).resolves.toMatchObject({ roles: ["BUYER", "ADMIN"] });
    expect(mocks.elevate).toHaveBeenCalledExactlyOnceWith(userId);
  });

  it.each(["test", "production"] as const)("never elevates a production deployment with NODE_ENV=%s and stale preview flags", async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("LIBER_CEO_PREVIEW_TARGET", "ceo-preview");
    vi.stubEnv("LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL", "true");
    await expect(getSessionUser()).resolves.toMatchObject({ roles: ["BUYER"] });
    expect(mocks.elevate).not.toHaveBeenCalled();
  });
});
