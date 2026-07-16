import { notFound } from "next/navigation";
import { LoiWorkspace } from "../../../components/loi/loi-workspace";
import { LoiError } from "../../../server/loi/errors";
import { getLoiNegotiation } from "../../../server/loi/service";

export default async function LoiNegotiationPage({ params }: { params: Promise<{ negotiationId: string }> }) {
  const { negotiationId } = await params;
  let negotiation: Awaited<ReturnType<typeof getLoiNegotiation>>;
  try {
    negotiation = await getLoiNegotiation(negotiationId);
  } catch (error) {
    if (error instanceof LoiError && ["NOT_FOUND", "UNAVAILABLE"].includes(error.code)) notFound();
    throw error;
  }
  return <LoiWorkspace initialNegotiation={negotiation} />;
}
