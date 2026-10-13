import { SignupView, type SignupSearchParams } from "./signup-view";

export default function SignupPage({ searchParams }: { searchParams: Promise<SignupSearchParams> }) {
  return (
    <div className="auth-page">
      <SignupView searchParams={searchParams} />
    </div>
  );
}
