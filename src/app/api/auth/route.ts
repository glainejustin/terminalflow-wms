import { cookies } from "next/headers";
import { db } from "@/db";
import { operators } from "@/db/schema";
import { eq } from "drizzle-orm";
import { currentOperator, demoOperatorsAllowed, SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth";
import { verifyPin } from "@/lib/pin";
import { DEMO_OPERATORS, ensureSeeded } from "@/lib/seed";
import { ROLES } from "@/lib/workflow";

export const dynamic = "force-dynamic";

function operatorView(record: typeof operators.$inferSelect) {
  return { id: record.id, name: record.name, role: record.role, roleLabel: ROLES[record.role as keyof typeof ROLES] ?? record.role, isDemo: record.isDemo };
}

export async function GET() {
  try {
    await ensureSeeded();
    const operator = await currentOperator();
    const records = await db.select().from(operators).where(eq(operators.active, true));
    const options = records
      .filter((record) => !record.isDemo || demoOperatorsAllowed())
      .map(operatorView)
      .sort((a, b) => a.name.localeCompare(b.name));
    const configured = options.length > 0;
    const demoEnabled = demoOperatorsAllowed();
    const demoHints = demoEnabled
      ? Object.fromEntries(records.filter((record) => record.isDemo).map((record) => [record.id, DEMO_OPERATORS.find((demo) => demo.name === record.name)?.pin ?? ""]))
      : {};
    return Response.json({ operator, options, configured, demoEnabled, demoHints });
  } catch (error) {
    console.error("Could not load sign-in options", error);
    const message = error instanceof Error ? error.message : "Could not load sign-in options.";
    return Response.json({ operator: null, options: [], configured: false, error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureSeeded();
    const body = await request.json();
    const operatorId = String(body.operatorId || "").trim();
    const pin = String(body.pin || "");
    if (!operatorId || !pin) return Response.json({ error: "Choose your operator and enter your PIN." }, { status: 400 });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operatorId)) {
      return Response.json({ error: "Choose a valid operator account." }, { status: 400 });
    }
    const [record] = await db.select().from(operators).where(eq(operators.id, operatorId)).limit(1);
    if (!record || !record.active || (record.isDemo && !demoOperatorsAllowed()) || !verifyPin(pin, record.pinHash)) {
      return Response.json({ error: "Those sign-in details were not recognised." }, { status: 401 });
    }
    const token = signSession(record.id);
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());
    return Response.json({ operator: { id: record.id, name: record.name, role: record.role }, token });
  } catch (error) {
    console.error("Sign-in failed", error);
    const message = error instanceof Error && error.message.includes("SESSION_SECRET")
      ? "Sign-in is not configured: set a random SESSION_SECRET of at least 32 characters."
      : "Could not sign in.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return Response.json({ ok: true });
}
