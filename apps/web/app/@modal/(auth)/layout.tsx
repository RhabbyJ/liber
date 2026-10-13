import type { ReactNode } from "react";
import { AuthModal } from "../../../components/auth-modal";

// Shared by the log in and signup intercepts so switching tabs keeps one dialog open.
export default function AuthModalLayout({ children }: { children: ReactNode }) {
  return <AuthModal>{children}</AuthModal>;
}
