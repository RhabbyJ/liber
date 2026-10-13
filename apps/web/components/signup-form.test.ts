import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.resolve(file), "utf8");

describe("signup form", () => {
  it("keeps React as the only signup state owner", () => {
    const source = read("components/signup-form.tsx");

    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toMatch(/\.addEventListener\(/);
    expect(source).toContain("onSubmit={handleSubmit}");
  });

  it("asks for buyer, seller, or both once, inline, and keeps a URL-prefilled role selected", () => {
    const source = read("components/signup-form.tsx");

    expect(source).toContain("How will you use Liber?");
    expect(source).toContain('const [role, setRole] = useState<Role>(initialRole ?? "buyer")');
    expect(source.match(/name="role"/g)).toHaveLength(1);
    expect(source).toContain("Publish demand sellers can find and invite.");
  });

  it("submits the unchanged account fields through the signup server action", () => {
    const source = read("components/signup-form.tsx");

    expect(source).toContain("action={signupWithPassword}");
    expect(source).toContain('name="name"');
    expect(source).toContain('name="email"');
    expect(source).toContain('name="password"');
    expect(source).toContain('name="next"');
    expect(source).toContain("12+ characters");
  });

  it("renders log in, signup, and email confirmation on the shared split auth page", () => {
    expect(read("app/signup/signup-view.tsx")).toContain('<AuthShell title="Create account">');
    expect(read("app/login/login-view.tsx")).toContain('<AuthShell context={context} title="Log in">');
    expect(read("app/signup/verify/page.tsx")).toContain("<AuthShell");
  });

  it("keeps password login on the single native API post", () => {
    const loginForm = read("components/login-form.tsx");

    expect(loginForm).toContain('action="/api/auth/login"');
    expect(loginForm).toContain('method="post"');
    expect(loginForm).not.toContain("fetch(");
    expect(loginForm).not.toContain("signInWithPassword");
    expect(loginForm).not.toContain("server/");
  });

  it("reveals the password step on the client without asking whether an account exists", () => {
    const loginForm = read("components/login-form.tsx");

    expect(loginForm).toContain('setStep("password")');
    expect(loginForm).not.toMatch(/\/api\/(auth|users?)\/(exists|lookup|check)/);
  });
});
