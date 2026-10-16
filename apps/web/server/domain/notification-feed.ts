import "server-only";

import { listNotificationItems } from "../notifications";
import { requireAuthenticatedUser } from "./shared";

export async function listNotifications() {
  const user = await requireAuthenticatedUser();
  return { ok: true, data: await listNotificationItems(user) };
}
