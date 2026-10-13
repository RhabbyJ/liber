const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Explicit, expiring test permission; it never grants a verification badge.
export function financingTestExceptionExpiresAt(
  buyerUserId: string,
  negotiationId: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = Date.now(),
): string | null {
  const buyer = env.LIBER_LOI_TEST_FINANCING_BUYER_ID?.trim();
  const negotiation = env.LIBER_LOI_TEST_FINANCING_NEGOTIATION_ID?.trim();
  const expiresAt = env.LIBER_LOI_TEST_FINANCING_EXPIRES_AT?.trim();
  if (!buyer || !negotiation || !expiresAt || !UUID.test(buyer) || !UUID.test(negotiation)) return null;
  if (buyer.toLowerCase() !== buyerUserId.toLowerCase() || negotiation.toLowerCase() !== negotiationId.toLowerCase()) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiresAt)) return null;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now && new Date(expiry).toISOString() === expiresAt ? expiresAt : null;
}
