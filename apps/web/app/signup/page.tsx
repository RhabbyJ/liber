import type { Metadata } from "next";
import { SignupView, type SignupSearchParams } from "./signup-view";

export const metadata: Metadata = {
  title: "Create account",
};

export default function SignupPage({ searchParams }: { searchParams: Promise<SignupSearchParams> }) {
  return <SignupView searchParams={searchParams} />;
}
