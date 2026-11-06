import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { operators } from "@/db/schema";
import { eq } from "drizzle-orm";

export const SESSION_COOKIE = "tf_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function demoOperatorsAllowed() {
  const explicit = process.env.ALLOW_DEMO_OPERATORS;
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(process.env.E2B_SANDBOX_ID);
}

function secret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    if (process.env.E2B_SANDBOX_ID) {
      return createHmac("sha256", "terminalflow-preview-session").update(process.env.E2B_SANDBOX_ID).digest("hex");
    }
    throw new Error("Set SESSION_SECRET to a random value of at least 32 characters.");
  }
  return configured || "terminalflow-local-development-secret";
}

export type Operator = { id: string; name: string; role: string };

export function signSession(operatorId: string) {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = Buffer.from(`${operatorId}.${expires}`).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(token?: string | null): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(createHmac("sha256", secret()).update(payload).digest("base64url"));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const separator = decoded.lastIndexOf(".");
  if (separator < 0) return null;
  const operatorId = decoded.slice(0, separator);
  const expires = Number(decoded.slice(separator + 1));
  if (!operatorId || !Number.isFinite(expires) || expires < Date.now()) return null;
  return operatorId;
}

export function sessionCookieOptions() {
  const production = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: production ? ("none" as const) : ("lax" as const),
    secure: production,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export async function currentOperator(): Promise<Operator | null> {
  const headerList = await headers();
  const authorization = headerList.get("authorization");
  const bearer = authorization && authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : null;
  const store = await cookies();
  const operatorId = verifySession(bearer) ?? verifySession(store.get(SESSION_COOKIE)?.value);
  if (!operatorId) return null;
  const [row] = await db.select().from(operators).where(eq(operators.id, operatorId)).limit(1);
  if (!row || !row.active || (row.isDemo && !demoOperatorsAllowed())) return null;
  return { id: row.id, name: row.name, role: row.role };
}
