import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), logs: vi.fn() }));

vi.mock("@liber/db", () => ({ prisma: { adminAuditLog: { findMany: mocks.logs } } }));
vi.mock("../session", async () => (await import("../session-mock.test-helper")).sessionModuleMock(mocks.session));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { listAuditLog } from "./audit-log";

const log = (index: number) => ({
  action: "suspend_user",
  actor: index === 0 ? null : { email: "admin@example.test", name: "Admin" },
  createdAt: new Date("2026-10-14T12:00:00Z"),
  id: `log-${String(index).padStart(3, "0")}`,
  metadata: { reason: "Synthetic" },
  targetId: "target",
  targetType: "user",
});

describe("admin audit log", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: "admin", roles: ["ADMIN"] });
  });

  it("pages the full history newest first instead of stopping at the latest 100", async () => {
    mocks.logs.mockResolvedValue(Array.from({ length: 101 }, (_, index) => log(index)));
    const result = await listAuditLog("log-cursor");
    expect(mocks.logs).toHaveBeenCalledWith({
      include: { actor: { select: { email: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: { id: "log-cursor" },
      skip: 1,
      take: 101,
    });
    expect(result.data).toHaveLength(100);
    expect(result.nextCursor).toBe("log-099");
    expect(result.data[0]).toEqual({
      action: "suspend_user", actor: "Deleted admin", createdAt: "2026-10-14", id: "log-000",
      metadata: { reason: "Synthetic" }, target: "user:target",
    });
  });

  it("is admin-only", async () => {
    mocks.session.mockResolvedValue({ id: "seller", roles: ["SELLER"] });
    await expect(listAuditLog()).rejects.toThrow("redirect:/seller/properties");
    expect(mocks.logs).not.toHaveBeenCalled();
  });
});
