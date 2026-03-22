// TOTP (Time-based One-Time Password) Utilities
// Implements RFC 6238 using Web Crypto API

export const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32ToBytes(base32: string): Uint8Array {
  const cleanBase32 = base32.replace(/=+$/, '').toUpperCase();

  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleanBase32) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

export async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message.buffer as ArrayBuffer);
  return new Uint8Array(signature);
}

export function intToBytes(num: number): Uint8Array {
  const bytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    bytes[i] = num & 0xff;
    num = Math.floor(num / 256);
  }
  return bytes;
}

export async function generateTOTP(secret: string): Promise<string | null> {
  try {
    const normalizedSecret = secret.replace(/[\s-]/g, '').toUpperCase();
    const keyBytes = base32ToBytes(normalizedSecret);

    if (keyBytes.length === 0) return null;

    const timeStep = Math.floor(Date.now() / 1000 / 30);
    const timeBytes = intToBytes(timeStep);
    const hmac = await hmacSha1(keyBytes, timeBytes);

    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  } catch {
    return null;
  }
}

export function getTimeRemaining(): number {
  const now = Math.floor(Date.now() / 1000);
  return 30 - (now % 30);
}
