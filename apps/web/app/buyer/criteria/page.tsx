import { redirect } from "next/navigation";

// v1 buyer setup is one wizard on /buyer/profile (profile + home fit + story).
export default function BuyerCriteriaPage() {
  redirect("/buyer/profile?edit=profile");
}
