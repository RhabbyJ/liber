import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoiWorkspace } from "../../../components/loi/loi-workspace";
import { LoiError } from "../../../server/loi/errors";
import { getLoiNegotiation } from "../../../server/loi/service";
import { getSessionUser } from "../../../server/session";

// A fixed title keeps names and addresses out of tabs and browser history.
export const metadata: Metadata = { title: "Letter of intent" };

export default async function LoiNegotiationPage({ params }: { params: Promise<{ negotiationId: string }> }) {
  const { negotiationId } = await params;
  let negotiation: Awaited<ReturnType<typeof getLoiNegotiation>>;
  try {
    negotiation = await getLoiNegotiation(negotiationId);
  } catch (error) {
    if (error instanceof LoiError && ["NOT_FOUND", "UNAVAILABLE"].includes(error.code)) notFound();
    throw error;
  }
  const user = await getSessionUser();
  return <LoiWorkspace initialNegotiation={negotiation} templateOwnerId={user?.id} />;
}
