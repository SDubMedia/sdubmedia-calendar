// Tiny password hashing helper for per-gallery delivery passwords.
// Format: "<salt_hex>:<iterations>:<hash_hex>"
// pbkdf2 with sha256 + 100k iterations is plenty for a low-stakes
// "don't let randos browse my photos" password.

import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const ITERATIONS = 100_000;
const KEY_LEN = 32;
const DIGEST = "sha256";

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(plain, salt, ITERATIONS, KEY_LEN, DIGEST).toString("hex");
  return `${salt}:${ITERATIONS}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [salt, iterStr, hashHex] = parts;
  const iter = parseInt(iterStr, 10);
  if (!salt || !iter || !hashHex) return false;
  const test = pbkdf2Sync(plain, salt, iter, KEY_LEN, DIGEST);
  const stored_buf = Buffer.from(hashHex, "hex");
  if (test.length !== stored_buf.length) return false;
  return timingSafeEqual(test, stored_buf);
}
