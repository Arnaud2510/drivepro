import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Accès administrateur par mot de passe unique (variable ADMIN_PASSWORD).
 * La session est un cookie « <expiration>.<signature HMAC> » : changer le mot de passe
 * invalide toutes les sessions ouvertes.
 */

type Env = Readonly<Record<string, string | undefined>>;

export const ADMIN_COOKIE = "wa_admin";
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;
const MIN_PASSWORD_LENGTH = 12;

function password(env: Env): string | null {
  const value = env.ADMIN_PASSWORD;
  return value && value.length >= MIN_PASSWORD_LENGTH ? value : null;
}

/** L'administration n'est disponible que si un mot de passe suffisamment long est configuré. */
export function adminEnabled(env: Env = process.env): boolean {
  return password(env) !== null;
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkAdminPassword(candidate: string, env: Env = process.env): boolean {
  const expected = password(env);
  if (!expected) return false;
  // Comparaison des empreintes : longueur fixe, temps constant.
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return safeEqual(digest(candidate), digest(expected));
}

function signature(expiresAt: number, secret: string): string {
  return createHmac("sha256", `wifiafrik-admin:${secret}`).update(String(expiresAt)).digest("base64url");
}

export function createAdminSession(now: number = Date.now(), env: Env = process.env): string {
  const secret = password(env);
  if (!secret) throw new Error("ADMIN_PASSWORD n'est pas configuré.");
  const expiresAt = Math.floor(now / 1000) + ADMIN_SESSION_SECONDS;
  return `${expiresAt}.${signature(expiresAt, secret)}`;
}

export function verifyAdminSession(
  value: string | undefined,
  now: number = Date.now(),
  env: Env = process.env,
): boolean {
  const secret = password(env);
  if (!secret || !value) return false;
  const [rawExpiresAt, sig] = value.split(".");
  const expiresAt = Number(rawExpiresAt);
  if (!Number.isInteger(expiresAt) || !sig || expiresAt <= Math.floor(now / 1000)) return false;
  return safeEqual(Buffer.from(sig), Buffer.from(signature(expiresAt, secret)));
}
