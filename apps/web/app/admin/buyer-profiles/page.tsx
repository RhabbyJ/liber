import Link from "next/link";
import { PageTitle } from "../../../components/page-title";
import { listAdminBuyerProfiles } from "../../../server/contracts";
import { submitProfileHide } from "../../../server/form-actions";

export default async function AdminBuyerProfilesPage() {
  const { data: buyers } = await listAdminBuyerProfiles();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Admin" title="Buyer profiles" />
      <section className="grid two">
        {buyers.map((buyer) => (
          <article className="card stack" key={buyer.id}>
            <div className="section-head compact">
              <div>
                <p className="eyebrow">{buyer.type}</p>
                <h2>{buyer.name}</h2>
              </div>
              <span className={buyer.visibility === "active" ? "status-dot active" : "status-dot"}>
                {buyer.visibility}
              </span>
            </div>
            <p className="muted">{buyer.bio}</p>
            <div className="actions">
              <Link className="button secondary" href={`/buyers/${buyer.id}`}>Open</Link>
              <form action={submitProfileHide}>
                <input name="buyerProfileId" type="hidden" value={buyer.id} />
                <button className="button warning" type="submit">Hide profile</button>
              </form>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
