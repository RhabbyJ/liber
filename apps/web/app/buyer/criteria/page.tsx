import { redirect } from "next/navigation";

// v1 buyer setup is one form on /buyer/profile.
export default function BuyerCriteriaPage() {
  redirect("/buyer/profile?edit=profile");
}
