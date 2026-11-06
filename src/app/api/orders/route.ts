import { db } from "@/db";
import { orderEvents, orderLines, orders, operators, screeningRecords } from "@/db/schema";
import { currentOperator } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { logEvent, recalcOrderSummary } from "@/lib/orders";
import { CAGE_TYPES, DUTY_STATUSES, TEMPERATURE_CLASSES } from "@/lib/workflow";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

const stageFilters: Record<string, string[]> = {
  receiving: ["Received"],
  screening: ["Awaiting screening", "Screening", "On hold"],
  warehouse: ["Cleared", "In storage"],
  dispatch: ["Ready for dispatch", "In transit"],
  deliveries: ["Delivered"],
};

export async function GET(request: Request) {
  try {
    await ensureSeeded();
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? "25")));
    const stage = url.searchParams.get("stage");
    const query = (url.searchParams.get("q") ?? "").trim();
    const search = url.searchParams.get("search") ?? "";

    const conditions = [];
    if (stage && stageFilters[stage]) conditions.push(inArray(orders.status, stageFilters[stage]));
    if (search) conditions.push(eq(orders.status, search));
    if (query) {
      const pattern = `%${query}%`;
      conditions.push(or(ilike(orders.pccNumber, pattern), ilike(orders.retailer, pattern), ilike(orders.store, pattern), ilike(orders.supplier, pattern), ilike(orders.storageZone, pattern))!);
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, total] = await Promise.all([
      db.select().from(orders).where(where).orderBy(desc(orders.receivedAt)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ id: orders.id }).from(orders).where(where),
    ]);
    const orderIds = rows.map((row) => row.id);
    const [lines, events, roster] = await Promise.all([
      orderIds.length ? db.select().from(orderLines).where(inArray(orderLines.orderId, orderIds)) : Promise.resolve([]),
      db.select().from(orderEvents).orderBy(desc(orderEvents.createdAt)).limit(25),
      db.select({ id: operators.id, name: operators.name, role: operators.role }).from(operators).where(eq(operators.active, true)),
    ]);
    const linesByOrder = new Map<string, typeof lines>();
    for (const line of lines) {
      const bucket = linesByOrder.get(line.orderId) ?? [];
      bucket.push(line);
      linesByOrder.set(line.orderId, bucket);
    }
    const all = await db.select().from(orders);
    const allLines = await db.select().from(orderLines);
    const allScreening = await db.select().from(screeningRecords);
    const orderById = new Map(all.map((order) => [order.id, order]));
    const variance = allLines
      .filter((line) => line.unitsReceived !== line.unitsExpected)
      .slice(0, 8)
      .map((line) => {
        const order = orderById.get(line.orderId);
        return {
          pccNumber: order?.pccNumber ?? "",
          store: order?.store ?? "",
          sku: line.sku,
          description: line.description,
          unitsExpected: line.unitsExpected,
          unitsReceived: line.unitsReceived,
          varianceReason: line.varianceReason,
          receivedBy: line.receivedBy,
        };
      });
    const stats = {
      atCenter: all.filter((order) => !["In transit", "Delivered"].includes(order.status)).length,
      toScreen: all.filter((order) => ["Received", "Awaiting screening", "Screening", "On hold"].includes(order.status)).length,
      stored: all.filter((order) => order.status === "In storage").length,
      dispatchReady: all.filter((order) => order.status === "Ready for dispatch").length,
      inTransit: all.filter((order) => order.status === "In transit").length,
      delivered: all.filter((order) => order.status === "Delivered").length,
      totalUnits: all.reduce((n, order) => n + order.units, 0),
      cages: all.reduce((n, order) => n + order.cages, 0),
      valueCents: allLines.reduce((n, line) => n + line.unitsReceived * line.unitValueCents, 0),
      varianceLines: allLines.filter((line) => line.unitsReceived !== line.unitsExpected).length,
      varianceUnits: allLines.reduce((n, line) => n + Math.max(0, line.unitsExpected - line.unitsReceived), 0),
      onTime: (() => {
        const delivered = all.filter((order) => order.deliveredAt);
        if (!delivered.length) return null;
        const onTime = delivered.filter((order) => order.deliveredAt! <= order.expectedDelivery).length;
        return Math.round((onTime / delivered.length) * 100);
      })(),
      screening: {
        cleared: allScreening.filter((record) => record.result === "cleared").length,
        referred: allScreening.filter((record) => record.result === "referred").length,
        failed: allScreening.filter((record) => record.result === "failed").length,
      },
      byStatus: Object.fromEntries([...new Set(all.map((order) => order.status))].map((status) => [status, all.filter((order) => order.status === status).length])),
    };
    return Response.json({
      orders: rows.map((row) => ({ ...row, lines: linesByOrder.get(row.id) ?? [] })),
      total: total.length,
      page,
      pageSize,
      events,
      operators: roster,
      stats,
      variance,
    });
  } catch (error) {
    console.error("Failed to load orders", error);
    return Response.json({ error: "Could not load center orders." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const body = await request.json();
    const pccNumber = String(body.pccNumber || "").trim().toUpperCase();
    const retailer = String(body.retailer || "").trim();
    const store = String(body.store || "").trim();
    const terminal = String(body.terminal || "").trim();
    const supplier = String(body.supplier || "").trim();
    const category = String(body.category || "").trim();
    const expectedDelivery = new Date(body.expectedDelivery);
    const rawLines: Record<string, unknown>[] = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
    if (!pccNumber || !retailer || !store || !terminal || !supplier || !category || Number.isNaN(expectedDelivery.getTime())) {
      return Response.json({ error: "Complete all required order fields." }, { status: 400 });
    }
    const mappedLines = rawLines.map((line) => ({
      sku: String(line.sku || "").trim(),
      description: String(line.description || "").trim(),
      barcode: String(line.barcode || "").trim(),
      unitsExpected: Number(line.unitsExpected),
      cages: Number(line.cages ?? 0),
      unitValueCents: Number(line.unitValueCents ?? 0),
    }));
    const lines = mappedLines.filter((line) => line.sku && line.description && Number.isInteger(line.unitsExpected) && line.unitsExpected > 0);
    if (!lines.length) return Response.json({ error: "Add at least one manifest line with SKU, description and expected units." }, { status: 400 });
    const [created] = await db.insert(orders).values({
      pccNumber,
      retailer: retailer.slice(0, 120),
      store: store.slice(0, 120),
      storeEmail: String(body.storeEmail || "").slice(0, 160),
      terminal: terminal.slice(0, 40),
      supplier: supplier.slice(0, 120),
      category: category.slice(0, 60),
      cageType: CAGE_TYPES.includes(body.cageType) ? body.cageType : "Roll cage",
      temperatureClass: TEMPERATURE_CLASSES.includes(body.temperatureClass) ? body.temperatureClass : "Ambient",
      weightKg: Math.max(0, Math.round(Number(body.weightKg ?? 0))) || 0,
      supplierDocket: String(body.supplierDocket || "").slice(0, 80),
      dutyStatus: DUTY_STATUSES.includes(body.dutyStatus) ? body.dutyStatus : "Duty paid",
      expectedDelivery,
      priority: body.priority === "High" ? "High" : "Standard",
      notes: String(body.notes || "").slice(0, 1000),
      status: "Received",
      screening: "Pending",
      storageZone: "Receiving bay",
      createdBy: operator.name,
      updatedBy: operator.name,
    }).returning();
    await db.insert(orderLines).values(lines.map((line) => ({ ...line, orderId: created.id, category })));
    await recalcOrderSummary(created.id);
    await logEvent({ orderId: created.id, title: "Order received at center", detail: `${created.pccNumber} · ${created.retailer}`, kind: "info", actor: operator.name, actorRole: operator.role });
    return Response.json({ order: created }, { status: 201 });
  } catch (error) {
    console.error("Failed to create order", error);
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return Response.json({ error: "This PCC number already exists." }, { status: 409 });
    return Response.json({ error: "Could not receive order." }, { status: 500 });
  }
}
