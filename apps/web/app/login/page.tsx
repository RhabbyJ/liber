import { LoginView, type LoginSearchParams } from "./login-view";

export default function LoginPage({ searchParams }: { searchParams: Promise<LoginSearchParams> }) {
  return (
    <div className="auth-page">
      <LoginView searchParams={searchParams} />
    </div>
  );
}
