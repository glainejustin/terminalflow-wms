import { db } from "@/db";
import { mailMessages, orderLines, orders } from "@/db/schema";
import { currentOperator } from "@/lib/auth";
import { readMailboxMessage } from "@/lib/mail";
import { logEvent, recalcOrderSummary } from "@/lib/orders";
import { CAGE_TYPES, DUTY_STATUSES, TEMPERATURE_CLASSES } from "@/lib/workflow";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Parses manifest lines such as "SKU-100 | Product name | 24" out of a supplier email. */
export function parseManifest(body: string) {
  const parsed: { sku: string; description: string; unitsExpected: number }[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const match = raw.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]{2,})\s*[|,\t]\s*(.+?)\s*[|,\t]\s*(\d{1,6})\s*$/);
    if (match) parsed.push({ sku: match[1].trim(), description: match[2].trim(), unitsExpected: Number(match[3]) });
  }
  return parsed;
}

export async function POST(request: Request) {
  try {
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (!["manager", "receiver"].includes(operator.role)) return Response.json({ error: "Your role cannot import orders." }, { status: 403 });
    const body = await request.json();
    const internetMessageId = String(body.internetMessageId || "").trim();
    const pccNumber = String(body.pccNumber || "").trim().toUpperCase();
    const retailer = String(body.retailer || "").trim();
    const store = String(body.store || "").trim();
    const terminal = String(body.terminal || "").trim();
    const supplier = String(body.supplier || "").trim();
    const category = String(body.category || "").trim();
    const expectedDelivery = new Date(body.expectedDelivery);
    if (!pccNumber || !retailer || !store || !terminal || !supplier || !category || Number.isNaN(expectedDelivery.getTime())) {
      return Response.json({ error: "Complete the order header fields before importing." }, { status: 400 });
    }
    let lines: Record<string, unknown>[] = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
    if (!lines.length && internetMessageId) {
      const raw = await readMailboxMessage(internetMessageId);
      lines = parseManifest(raw) as unknown as Record<string, unknown>[];
    }
    const mappedLines = lines.map((line) => ({
      sku: String(line.sku || "").trim(),
      description: String(line.description || "").trim(),
      unitsExpected: Number(line.unitsExpected),
      cages: Number(line.cages ?? 0),
      unitValueCents: Number(line.unitValueCents ?? 0),
    }));
    const mapped = mappedLines.filter((line) => line.sku && line.description && Number.isInteger(line.unitsExpected) && line.unitsExpected > 0);
    if (!mapped.length) return Response.json({ error: "No manifest lines were found in that email. Add the lines manually." }, { status: 400 });
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
    await db.insert(orderLines).values(mapped.map((line) => ({ ...line, orderId: created.id, category })));
    await recalcOrderSummary(created.id);
    if (internetMessageId) {
      await db.update(mailMessages).set({ status: "imported", importedPccNumber: created.pccNumber }).where(eq(mailMessages.internetMessageId, internetMessageId));
    }
    await logEvent({ orderId: created.id, title: "Order imported from supplier email", detail: `${created.pccNumber} · ${created.retailer}`, kind: "info", actor: operator.name, actorRole: operator.role, note: internetMessageId ? `Source: ${internetMessageId}` : "" });
    return Response.json({ order: created, lines: mapped.length }, { status: 201 });
  } catch (error) {
    console.error("Failed to import order from email", error);
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return Response.json({ error: "This PCC number already exists." }, { status: 409 });
    return Response.json({ error: "Could not import the order from email." }, { status: 500 });
  }
}
