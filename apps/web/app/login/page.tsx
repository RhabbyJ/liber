import type { Metadata } from "next";
import { LoginView, type LoginSearchParams } from "./login-view";

export const metadata: Metadata = {
  title: "Log in",
};

export default function LoginPage({ searchParams }: { searchParams: Promise<LoginSearchParams> }) {
  return <LoginView searchParams={searchParams} />;
}
