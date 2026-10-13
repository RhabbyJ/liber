import { SignupView, type SignupSearchParams } from "../../../signup/signup-view";

export default function SignupModal({ searchParams }: { searchParams: Promise<SignupSearchParams> }) {
  return <SignupView presentation="modal" searchParams={searchParams} />;
}
