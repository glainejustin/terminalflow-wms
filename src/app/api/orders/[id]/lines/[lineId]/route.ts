import { db } from "@/db";
import { orderLines, orders } from "@/db/schema";
import { currentOperator } from "@/lib/auth";
import { logEvent, recalcOrderSummary } from "@/lib/orders";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Records what physically arrived against a manifest line, including any variance. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  try {
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (!["manager", "receiver"].includes(operator.role)) return Response.json({ error: "Your role cannot record receiving." }, { status: 403 });
    const { id, lineId } = await params;
    const body = await request.json();
    const unitsReceived = Number(body.unitsReceived);
    const unitsDamaged = Number(body.unitsDamaged ?? 0);
    const varianceReason = String(body.varianceReason || "").trim();
    if (!Number.isInteger(unitsReceived) || unitsReceived < 0) return Response.json({ error: "Enter the units received." }, { status: 400 });
    if (!Number.isInteger(unitsDamaged) || unitsDamaged < 0) return Response.json({ error: "Damaged units cannot be negative." }, { status: 400 });
    if (unitsDamaged > unitsReceived) return Response.json({ error: "Damaged units cannot exceed units received." }, { status: 400 });
    const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId)).limit(1);
    if (!line || line.orderId !== id) return Response.json({ error: "Manifest line not found." }, { status: 404 });
    const variance = unitsReceived !== line.unitsExpected;
    if (variance && !varianceReason) return Response.json({ error: "Give a reason for the quantity variance." }, { status: 400 });
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    const [updated] = await db.update(orderLines).set({
      unitsReceived,
      unitsDamaged,
      varianceReason: variance ? varianceReason : "",
      receivedBy: operator.name,
      receivedAt: new Date(),
    }).where(eq(orderLines.id, lineId)).returning();
    await recalcOrderSummary(id);
    await db.update(orders).set({ version: order.version + 1, updatedBy: operator.name }).where(eq(orders.id, id));
    await logEvent({
      orderId: id,
      title: variance ? "Receiving variance recorded" : "Receiving recorded",
      detail: variance ? `${order.pccNumber} · ${line.sku} ${unitsReceived}/${line.unitsExpected} · ${varianceReason}` : `${order.pccNumber} · ${line.sku} ${unitsReceived} units received`,
      kind: variance ? "warning" : "success",
      actor: operator.name,
      actorRole: operator.role,
      note: unitsDamaged ? `${unitsDamaged} units damaged` : "",
    });
    return Response.json({ line: updated });
  } catch (error) {
    console.error("Failed to record receiving", error);
    return Response.json({ error: "Could not record receiving." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  try {
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (!["manager", "receiver"].includes(operator.role)) return Response.json({ error: "Your role cannot remove manifest lines." }, { status: 403 });
    const { id, lineId } = await params;
    const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId)).limit(1);
    if (!line || line.orderId !== id) return Response.json({ error: "Manifest line not found." }, { status: 404 });
    await db.delete(orderLines).where(eq(orderLines.id, lineId));
    await recalcOrderSummary(id);
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (order) await db.update(orders).set({ version: order.version + 1, updatedBy: operator.name }).where(eq(orders.id, id));
    await logEvent({ orderId: id, title: "Manifest line removed", detail: `${order?.pccNumber ?? id} · ${line.sku}`, kind: "warning", actor: operator.name, actorRole: operator.role });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove line", error);
    return Response.json({ error: "Could not remove manifest line." }, { status: 500 });
  }
}
