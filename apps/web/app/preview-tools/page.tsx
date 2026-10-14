import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "../../components/icon";
import { PageTitle } from "../../components/page-title";
import { sellerAccessStatusForUser } from "../../server/access";
import { hasRole } from "../../server/authz";
import { ceoPreviewToolsEnabled } from "../../server/ceo-preview";
import { getSessionUser } from "../../server/session";
import { enablePreviewAdminAccess, enablePreviewSellerAccess } from "./actions";

export const metadata: Metadata = {
  robots: "noindex, noarchive",
  title: "Private-preview test controls — Liber",
};

export default async function PreviewToolsPage() {
  if (!ceoPreviewToolsEnabled()) notFound();

  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fpreview-tools");

  const isSeller = hasRole(user, "SELLER");
  const isAdmin = hasRole(user, "ADMIN");
  const status = isSeller ? await sellerAccessStatusForUser(user.id) : null;
  const canEnableSeller = isSeller && status !== "APPROVED" && status !== "SUSPENDED";

  return (
    <div className="page narrow stack loose">
      <PageTitle title="Test controls" />
      <div className="inline-alert warning" role="note">
        <Icon name="info" size={20} />
        <p>
          Private preview only. While these flags are on, every active signed-in account gets admin access and sellers get
          approved directory access.
        </p>
      </div>

      <section className="card stack">
        <h2>Admin review tools</h2>

        {isAdmin ? (
          <>
            <p>This account already has admin access for the private preview (auto-granted on sign-in).</p>
            <div className="actions inline">
              <Link className="button primary" href="/admin">Open admin</Link>
            </div>
          </>
        ) : (
          <>
            <p>
              Admin should already be auto-granted. Use this only if elevation did not apply yet.
            </p>
            <form action={enablePreviewAdminAccess}>
              <button className="button primary" type="submit">Enable my admin test access</button>
            </form>
          </>
        )}
      </section>

      <section className="card stack">
        <h2>Approved seller workflow</h2>

        {!isSeller ? (
          <p>
            This account does not have the seller role. Use an account created with seller or both-role intent to test seller workflows.
          </p>
        ) : status === "APPROVED" ? (
          <>
            <p>Your seller-directory access is approved for this private preview (auto-approved on sign-in).</p>
            <div className="actions inline">
              <Link className="button primary" href="/">Open the buyer map</Link>
            </div>
          </>
        ) : status === "SUSPENDED" ? (
          <p>Seller access is suspended. Use the admin panel (or another admin account) to review this account before access can be restored.</p>
        ) : (
          <>
            <p>
              Current status: <strong>{status ?? "Not requested"}</strong>. Seller approval should auto-apply on the next signed-in request; use the button only if it did not.
            </p>
            {canEnableSeller ? (
              <form action={enablePreviewSellerAccess}>
                <button className="button primary" type="submit">Enable my seller test access</button>
              </form>
            ) : null}
          </>
        )}
      </section>

      <p className="small">
        These private-preview controls must be disabled before public launch. Auto-granted admin and seller-access rows are rejected by true-production readiness until a real review removes the preview markers.
      </p>
    </div>
  );
}
