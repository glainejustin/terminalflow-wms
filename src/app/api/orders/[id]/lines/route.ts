import { db } from "@/db";
import { orderLines, orders } from "@/db/schema";
import { currentOperator } from "@/lib/auth";
import { logEvent, recalcOrderSummary } from "@/lib/orders";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (!["manager", "receiver"].includes(operator.role)) return Response.json({ error: "Your role cannot add manifest lines." }, { status: 403 });
    const { id } = await params;
    const body = await request.json();
    const sku = String(body.sku || "").trim();
    const description = String(body.description || "").trim();
    const unitsExpected = Number(body.unitsExpected);
    const cages = Number(body.cages ?? 0);
    if (!sku || !description || !Number.isInteger(unitsExpected) || unitsExpected < 1) {
      return Response.json({ error: "A line needs a SKU, description and expected units." }, { status: 400 });
    }
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    const [line] = await db.insert(orderLines).values({
      orderId: id,
      sku: sku.slice(0, 64),
      description: description.slice(0, 160),
      barcode: String(body.barcode || "").slice(0, 64),
      category: order.category,
      cages: Number.isFinite(cages) && cages > 0 ? Math.round(cages) : 0,
      unitsExpected,
      unitValueCents: Math.max(0, Math.round(Number(body.unitValueCents ?? 0))),
    }).returning();
    await recalcOrderSummary(id);
    await db.update(orders).set({ version: order.version + 1, updatedBy: operator.name }).where(eq(orders.id, id));
    await logEvent({ orderId: id, title: "Manifest line added", detail: `${order.pccNumber} · ${sku} (${unitsExpected} units)`, kind: "info", actor: operator.name, actorRole: operator.role });
    return Response.json({ line }, { status: 201 });
  } catch (error) {
    console.error("Failed to add line", error);
    return Response.json({ error: "Could not add manifest line." }, { status: 500 });
  }
}
