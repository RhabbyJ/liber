import { describe, expect, it } from "vitest";
import { publicIdentityCode, publicNameForDisplay } from "./public-identity";

describe("account public identity", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("keeps the same random account code across name and role changes", () => {
    const code = publicIdentityCode(id);
    expect(code).toMatch(/^[0-9A-F]{12}$/);
    expect(publicNameForDisplay("Julie PrivateSurname", id)).toBe(`Julie P. #${code}`);
    expect(publicNameForDisplay("Jules PrivateSurname", id)).toBe(`Jules P. #${code}`);
    expect(publicNameForDisplay("Julie PrivateSurname", id)).not.toContain(id);
  });
  it("distinguishes matching limited names without disclosing surnames", () => {
    expect(publicNameForDisplay("Julie PrivateSurname", id)).not.toBe(publicNameForDisplay("Julie PrivateSurname", "22222222-2222-4222-8222-222222222222"));
  });
  it("does not invent a personal name for legacy nameless accounts", () => {
    expect(publicNameForDisplay(null, id)).toBe(`Member #${publicIdentityCode(id)}`);
  });
});
