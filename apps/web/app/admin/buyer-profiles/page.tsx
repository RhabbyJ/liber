import type { Metadata } from "next";
import Link from "next/link";
import { AdminPagination } from "../../../components/admin-pagination";
import { AdminReasonAction } from "../../../components/admin-reason-action";
import { PageTitle } from "../../../components/page-title";
import { listAdminBuyerProfiles } from "../../../server/contracts";
import { submitProfileHide, submitProfileUnhide } from "../../../server/form-actions";
import { readAdminPage, type AdminPageSearchParams } from "../page-cursor";

export const metadata: Metadata = { title: "Buyer profiles · Admin" };

const moderationLabels: Record<string, string> = {
  ACTIVE: "Live",
  DRAFT: "Draft",
  HIDDEN: "Hidden by admin",
  SUSPENDED: "Account suspended",
};

export default async function AdminBuyerProfilesPage({ searchParams }: { searchParams: AdminPageSearchParams }) {
  const { cursor, page: { data: buyers, nextCursor } } = await readAdminPage(searchParams, listAdminBuyerProfiles);

  return (
    <div className="page stack">
      <PageTitle title="Buyer profiles">
        Hidden profiles leave seller search and previews until you unhide them. Suspended accounts are restored from <Link href="/admin/users">Users</Link>.
      </PageTitle>
      <section className="grid two">
        {buyers.map((buyer) => (
          <article className="card stack" key={buyer.id}>
            <div className="section-head compact">
              <div>
                <h2>{buyer.name}</h2>
                <p className="meta-line">{buyer.type}</p>
              </div>
              <span className={buyer.moderationStatus === "ACTIVE" ? "status-dot active" : "status-dot"}>
                {moderationLabels[buyer.moderationStatus] ?? buyer.moderationStatus}
              </span>
            </div>
            <p className="muted">{buyer.bio}</p>
            <div className="actions">
              <Link className="button secondary" href={`/buyers/${buyer.id}`}>Open</Link>
              {buyer.moderationStatus === "HIDDEN" ? (
                <AdminReasonAction
                  action={submitProfileUnhide}
                  confirmLabel="Unhide profile"
                  fields={{ buyerProfileId: buyer.id }}
                  label="Unhide"
                  pendingLabel="Unhiding…"
                  prompt="A profile that was live when hidden goes live again if it still meets the publication rules; otherwise the buyer gets it back as a draft to republish."
                  reasonLabel="Reason (optional, audit log only)"
                  reasonRequired={false}
                />
              ) : (
                <AdminReasonAction
                  action={submitProfileHide}
                  confirmLabel="Hide profile"
                  fields={{ buyerProfileId: buyer.id }}
                  label="Hide profile"
                  pendingLabel="Hiding…"
                  prompt="Sellers and previews stop showing this profile. Its open invites are withdrawn and their conversations become read-only."
                  reasonLabel="Reason (optional, audit log only)"
                  reasonRequired={false}
                  tone="warning"
                />
              )}
            </div>
          </article>
        ))}
      </section>
      <AdminPagination basePath="/admin/buyer-profiles" cursor={cursor} label="Buyer profiles" nextCursor={nextCursor} />
    </div>
  );
}
