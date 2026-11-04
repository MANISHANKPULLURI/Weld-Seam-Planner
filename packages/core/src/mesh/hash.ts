// Returns null where Web Crypto is unavailable (plain-http pages other than localhost).
export async function sha256Hex(data: ArrayBuffer): Promise<string | null> {

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;

  const digest = new Uint8Array(await subtle.digest("SHA-256", data));
  let hex = "";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  return hex;
}
