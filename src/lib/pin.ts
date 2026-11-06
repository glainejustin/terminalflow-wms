import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPin(pin: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(pin, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
