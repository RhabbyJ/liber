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

  it("renders signup and log in on the shared auth card", () => {
    const signupView = read("app/signup/signup-view.tsx");
    const loginView = read("app/login/login-view.tsx");
    const loginForm = read("components/login-form.tsx");

    expect(signupView).toContain("<AuthCard");
    expect(signupView).toContain('active="signup"');
    expect(loginView).toContain('<AuthCard active="login"');
    expect(loginForm).toContain('action="/api/auth/login"');
    expect(loginForm).toContain('method="post"');
  });

  it("keeps password login on the single API write path, even inside the modal", () => {
    const loginForm = read("components/login-form.tsx");

    expect(loginForm).toContain("fetch(form.action");
    expect(loginForm).not.toContain("signInWithPassword");
    expect(loginForm).not.toContain("server/");
  });

  it("opens log in and signup over the current page only through the intercepting routes", () => {
    const modalLayout = read("app/@modal/(auth)/layout.tsx");
    const loginModal = read("app/@modal/(auth)/(.)login/page.tsx");
    const signupModal = read("app/@modal/(auth)/(.)signup/page.tsx");

    expect(modalLayout).toContain("<AuthModal>");
    expect(loginModal).toContain('<LoginView presentation="modal"');
    expect(signupModal).toContain('<SignupView presentation="modal"');
  });
});
