import { db } from "@/db";
import { orderEvents, orderLines, orders, screeningRecords } from "@/db/schema";
import { currentOperator } from "@/lib/auth";
import { logEvent } from "@/lib/orders";
import { canTransition, roleCanTransition } from "@/lib/workflow";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const { id } = await params;
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    const [lines, screening, events] = await Promise.all([
      db.select().from(orderLines).where(eq(orderLines.orderId, id)),
      db.select().from(screeningRecords).where(eq(screeningRecords.orderId, id)).orderBy(desc(screeningRecords.createdAt)),
      db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(desc(orderEvents.createdAt)),
    ]);
    return Response.json({ order, lines, screening, events });
  } catch (error) {
    console.error("Failed to load order detail", error);
    return Response.json({ error: "Could not load order." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const nextStatus = String(body.status || "");
    const expectedVersion = Number(body.expectedVersion);
    const note = String(body.note || "").trim();
    const storageZone = String(body.storageZone || "").trim();
    const quarantineReason = String(body.quarantineReason || "").trim();

    const [current] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!current) return Response.json({ error: "Order not found." }, { status: 404 });
    if (!Number.isFinite(expectedVersion)) return Response.json({ error: "Missing order version." }, { status: 400 });
    if (current.version !== expectedVersion) {
      return Response.json({ error: `This order was updated by ${current.updatedBy}. Reload before acting.`, current }, { status: 409 });
    }
    if (!canTransition(current.status, nextStatus)) {
      return Response.json({ error: `Cannot move from ${current.status} to ${nextStatus}.` }, { status: 400 });
    }
    if (!roleCanTransition(operator.role, nextStatus)) {
      return Response.json({ error: `Your role cannot authorise ${nextStatus}.` }, { status: 403 });
    }
    if (nextStatus === "Cleared" && current.screening !== "Cleared") {
      return Response.json({ error: "Record screening clearance evidence before clearing this order." }, { status: 400 });
    }
    if (nextStatus === "On hold" && !quarantineReason) {
      return Response.json({ error: "A quarantine reason is required when placing goods on hold." }, { status: 400 });
    }
    if (nextStatus === "Delivered" && !note) {
      return Response.json({ error: "Record a delivery note as proof of handover to the store." }, { status: 400 });
    }
    const sealNumber = String(body.sealNumber || "").trim();
    if (nextStatus === "In transit" && !sealNumber && !current.sealNumber) {
      return Response.json({ error: "A cage seal number is required before goods leave for the airport." }, { status: 400 });
    }
    if (nextStatus === "In transit") {
      const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, id));
      if (!lines.length) return Response.json({ error: "This order has no manifest lines." }, { status: 400 });
      const outstanding = lines.filter((line) => !line.receivedAt);
      if (outstanding.length) {
        return Response.json({ error: `Receiving is not complete for ${outstanding.length} line${outstanding.length === 1 ? "" : "s"}. Record received quantities first.` }, { status: 400 });
      }
    }

    const now = new Date();
    const nextZone = nextStatus === "In storage" ? (storageZone || "Warehouse A-01") : nextStatus === "Ready for dispatch" ? "Dispatch staging" : nextStatus === "In transit" ? "With airport transport" : nextStatus === "Delivered" ? "Store delivered" : nextStatus === "On hold" ? "Quarantine" : current.storageZone;
    const [updated] = await db
      .update(orders)
      .set({
        status: nextStatus,
        storageZone: nextZone.slice(0, 40),
        ...(sealNumber ? { sealNumber: sealNumber.slice(0, 40) } : {}),
        updatedBy: operator.name,
        updatedAt: now,
        version: current.version + 1,
        ...(nextStatus === "In transit" ? { dispatchedAt: now } : {}),
        ...(nextStatus === "Delivered" ? { deliveredAt: now } : {}),
      })
      .where(and(eq(orders.id, id), eq(orders.version, current.version)))
      .returning();
    if (!updated) {
      const [latest] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      return Response.json({ error: "Another operator updated this order first. Reload before acting.", current: latest }, { status: 409 });
    }
    await logEvent({
      orderId: id,
      title: `Stage changed to ${nextStatus}`,
      detail: `${updated.pccNumber} · ${updated.store}`,
      kind: nextStatus === "On hold" ? "warning" : ["Cleared", "Delivered"].includes(nextStatus) ? "success" : ["In storage", "Ready for dispatch"].includes(nextStatus) ? "purple" : "info",
      actor: operator.name,
      actorRole: operator.role,
      note: [note, quarantineReason ? `Hold: ${quarantineReason}` : ""].filter(Boolean).join(" — "),
    });
    return Response.json({ order: updated });
  } catch (error) {
    console.error("Failed to update order", error);
    return Response.json({ error: "Could not update order." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (operator.role !== "manager") return Response.json({ error: "Only a center manager can delete an order." }, { status: 403 });
    const { id } = await params;
    const [deleted] = await db.delete(orders).where(eq(orders.id, id)).returning();
    if (!deleted) return Response.json({ error: "Order not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete order", error);
    return Response.json({ error: "Could not delete order." }, { status: 500 });
  }
}
