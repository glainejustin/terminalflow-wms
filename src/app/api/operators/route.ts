import { db } from "@/db";
import { operators } from "@/db/schema";
import { currentOperator } from "@/lib/auth";
import { hashPin } from "@/lib/pin";
import { ROLES } from "@/lib/workflow";
import { asc, eq, ilike } from "drizzle-orm";

export const dynamic = "force-dynamic";

function publicOperator(record: typeof operators.$inferSelect) {
  return { id: record.id, name: record.name, role: record.role, active: record.active, isDemo: record.isDemo, createdAt: record.createdAt };
}

export async function GET() {
  const actor = await currentOperator();
  if (!actor) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  if (actor.role !== "manager") return Response.json({ error: "Only a center manager can manage operator accounts." }, { status: 403 });
  const records = await db.select().from(operators).orderBy(asc(operators.name));
  return Response.json({ operators: records.map(publicOperator) });
}

export async function POST(request: Request) {
  try {
    const actor = await currentOperator();
    if (!actor) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (actor.role !== "manager") return Response.json({ error: "Only a center manager can create operator accounts." }, { status: 403 });
    const body = await request.json();
    const name = String(body.name || "").trim();
    const role = String(body.role || "");
    const pin = String(body.pin || "");
    if (name.length < 2 || name.length > 80) return Response.json({ error: "Enter an operator name between 2 and 80 characters." }, { status: 400 });
    if (!Object.hasOwn(ROLES, role)) return Response.json({ error: "Choose a valid warehouse role." }, { status: 400 });
    if (pin.length < 8 || pin.length > 128) return Response.json({ error: "PIN must be at least 8 characters." }, { status: 400 });
    const [duplicate] = await db.select({ id: operators.id }).from(operators).where(ilike(operators.name, name)).limit(1);
    if (duplicate) return Response.json({ error: "An operator with that name already exists." }, { status: 409 });
    const [created] = await db.insert(operators).values({ name, role, pinHash: hashPin(pin), isDemo: false, active: true }).returning();
    return Response.json({ operator: publicOperator(created) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create operator", error);
    return Response.json({ error: "Could not create operator." }, { status: 500 });
  }
}
