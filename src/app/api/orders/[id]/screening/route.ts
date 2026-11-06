import { db } from "@/db";
import { orders, screeningRecords } from "@/db/schema";
import { currentOperator } from "@/lib/auth";
import { logEvent } from "@/lib/orders";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Records security screening evidence. Clearance is the gate for everything that follows. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (!["manager", "screener"].includes(operator.role)) return Response.json({ error: "Only a security screener can record screening evidence." }, { status: 403 });
    const { id } = await params;
    const body = await request.json();
    const method = String(body.method || "").trim();
    const result = String(body.result || "").trim();
    const reference = String(body.reference || "").trim();
    const notes = String(body.notes || "").trim();
    const quarantineReason = String(body.quarantineReason || "").trim();
    if (!method) return Response.json({ error: "Select the screening method used." }, { status: 400 });
    if (!["cleared", "referred", "failed"].includes(result)) return Response.json({ error: "Select a screening result." }, { status: 400 });
    if (result !== "cleared" && !quarantineReason) return Response.json({ error: "A quarantine reason is required when goods are not cleared." }, { status: 400 });
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    const [record] = await db.insert(screeningRecords).values({
      orderId: id,
      method: method.slice(0, 48),
      result,
      screenerName: operator.name,
      reference: reference.slice(0, 80),
      notes: notes.slice(0, 1000),
      quarantineReason: quarantineReason.slice(0, 120),
    }).returning();
    const now = new Date();
    const nextStatus = result === "cleared" ? (order.status === "Screening" ? "Cleared" : order.status) : order.status === "Screening" || order.status === "Awaiting screening" ? "On hold" : order.status;
    const nextZone = result === "cleared" ? (order.status === "Screening" ? "Screening exit" : order.storageZone) : nextStatus === "On hold" ? "Quarantine" : order.storageZone;
    await db.update(orders).set({
      screening: result === "cleared" ? "Cleared" : "Failed",
      status: nextStatus,
      storageZone: nextZone,
      updatedBy: operator.name,
      updatedAt: now,
      version: order.version + 1,
    }).where(eq(orders.id, id));
    await logEvent({
      orderId: id,
      title: result === "cleared" ? "Screening cleared" : "Screening not cleared",
      detail: `${order.pccNumber} · ${method}${reference ? ` · ${reference}` : ""}`,
      kind: result === "cleared" ? "success" : "warning",
      actor: operator.name,
      actorRole: operator.role,
      note: [notes, quarantineReason ? `Hold: ${quarantineReason}` : ""].filter(Boolean).join(" — "),
    });
    return Response.json({ record, status: nextStatus }, { status: 201 });
  } catch (error) {
    console.error("Failed to record screening", error);
    return Response.json({ error: "Could not record screening evidence." }, { status: 500 });
  }
}
