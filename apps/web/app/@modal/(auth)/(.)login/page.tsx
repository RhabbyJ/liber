import { LoginView, type LoginSearchParams } from "../../../login/login-view";

export default function LoginModal({ searchParams }: { searchParams: Promise<LoginSearchParams> }) {
  return <LoginView presentation="modal" searchParams={searchParams} />;
}
