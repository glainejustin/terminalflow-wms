import { db } from "@/db";
import { operators } from "@/db/schema";
import { currentOperator } from "@/lib/auth";
import { hashPin } from "@/lib/pin";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await currentOperator();
    if (!actor) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (actor.role !== "manager") return Response.json({ error: "Only a center manager can update operator accounts." }, { status: 403 });
    const { id } = await params;
    const body = await request.json();
    const [target] = await db.select().from(operators).where(eq(operators.id, id)).limit(1);
    if (!target) return Response.json({ error: "Operator not found." }, { status: 404 });
    if (typeof body.active === "boolean") {
      if (target.id === actor.id && !body.active) return Response.json({ error: "You cannot deactivate your own active session." }, { status: 400 });
      const [updated] = await db.update(operators).set({ active: body.active }).where(eq(operators.id, id)).returning();
      return Response.json({ operator: { id: updated.id, name: updated.name, role: updated.role, active: updated.active, isDemo: updated.isDemo } });
    }
    const pin = String(body.pin || "");
    if (pin.length < 8 || pin.length > 128) return Response.json({ error: "PIN must be at least 8 characters." }, { status: 400 });
    const [updated] = await db.update(operators).set({ pinHash: hashPin(pin) }).where(eq(operators.id, id)).returning();
    return Response.json({ operator: { id: updated.id, name: updated.name, role: updated.role, active: updated.active, isDemo: updated.isDemo } });
  } catch (error) {
    console.error("Failed to update operator", error);
    return Response.json({ error: "Could not update operator." }, { status: 500 });
  }
}
