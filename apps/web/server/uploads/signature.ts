import { UploadError } from "./errors";

const SIGNATURE_BYTES = 16;
const SIGNATURE_TIMEOUT_MS = 5_000;

export async function detectRemoteMime(signedUrl: string) {
  const response = await fetch(signedUrl, {
    headers: { Range: `bytes=0-${SIGNATURE_BYTES - 1}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(SIGNATURE_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) throw new UploadError("Unable to inspect uploaded file.", 503);

  const reader = response.body.getReader();
  const signature = new Uint8Array(SIGNATURE_BYTES);
  let size = 0;
  try {
    while (size < SIGNATURE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, SIGNATURE_BYTES - size);
      signature.set(chunk, size);
      size += chunk.byteLength;
    }
  } finally {
    // Storage/CDNs may ignore Range. Never buffer the entire confidential file.
    await reader.cancel().catch(() => undefined);
  }
  return detectMime(signature.subarray(0, size));
}

function detectMime(bytes: Uint8Array) {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 16 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}
