import { redirect } from "next/navigation";
import { demandSearchHref, type DemandSearchParams } from "../../../lib/demand-search-href";

/** Seller search merged into the one buyer-demand map; old links keep their filters. */
export default async function SellerSearchPage({ searchParams }: { searchParams: Promise<DemandSearchParams> }) {
  redirect(demandSearchHref(await searchParams));
}
