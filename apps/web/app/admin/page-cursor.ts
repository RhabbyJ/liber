import { notFound } from "next/navigation";
import { InvalidPageCursorError } from "../../server/domain/shared";

export type AdminPageSearchParams = Promise<{ cursor?: string | string[] }>;

/** Reads one cursor page of an admin list; a repeated or malformed cursor is a 404, like the report queue. */
export async function readAdminPage<T>(searchParams: AdminPageSearchParams, read: (cursor?: string) => Promise<T>) {
  const { cursor } = await searchParams;
  if (Array.isArray(cursor)) notFound();
  try {
    return { cursor, page: await read(cursor || undefined) };
  } catch (error) {
    if (error instanceof InvalidPageCursorError) notFound();
    throw error;
  }
}
