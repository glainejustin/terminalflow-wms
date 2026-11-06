import { db } from "@/db";
import { orderEvents, orders, screeningRecords } from "@/db/schema";
import { currentOperator } from "@/lib/auth";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const STATEMENT =
  "Every screening decision, receiving variance and dispatch release recorded in this report was made by a named human operator using fixed, rule-based workflow logic. Terminalflow performs no model inference and makes no automated decisions: no stage advances on its own, and every status change, quantity variance and security clearance is timestamped against an identified person.";

export async function GET(request: Request) {
  try {
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "json";
    const [events, screening, allOrders] = await Promise.all([
      db.select().from(orderEvents).orderBy(asc(orderEvents.createdAt)),
      db.select().from(screeningRecords).orderBy(asc(screeningRecords.createdAt)),
      db.select({ id: orders.id, pccNumber: orders.pccNumber, retailer: orders.retailer, store: orders.store, terminal: orders.terminal, supplier: orders.supplier, category: orders.category, status: orders.status, screening: orders.screening }).from(orders),
    ]);
    const orderById = new Map(allOrders.map((order) => [order.id, order]));
    const rows = events.map((event) => {
      const order = event.orderId ? orderById.get(event.orderId) : undefined;
      return {
        timestamp: event.createdAt.toISOString(),
        pccNumber: order?.pccNumber ?? "",
        retailer: order?.retailer ?? "",
        store: order?.store ?? "",
        action: event.title,
        detail: event.detail,
        operator: event.actor,
        operatorRole: event.actorRole,
        note: event.note,
      };
    });
    const screeningRows = screening.map((record) => {
      const order = orderById.get(record.orderId);
      return {
        timestamp: record.createdAt.toISOString(),
        pccNumber: order?.pccNumber ?? "",
        retailer: order?.retailer ?? "",
        method: record.method,
        result: record.result,
        screener: record.screenerName,
        reference: record.reference,
        quarantineReason: record.quarantineReason,
        notes: record.notes,
      };
    });
    if (format === "csv") {
      const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
      const eventHeader = ["Timestamp", "PCC number", "Retailer", "Store", "Action", "Detail", "Operator", "Operator role", "Note"];
      const eventCsv = rows.map((row) => [row.timestamp, row.pccNumber, row.retailer, row.store, row.action, row.detail, row.operator, row.operatorRole, row.note].map((value) => escape(value ?? "")).join(","));
      const screeningHeader = ["Timestamp", "PCC number", "Retailer", "Method", "Result", "Screener", "Reference", "Quarantine reason", "Notes"];
      const screeningCsv = screeningRows.map((row) => [row.timestamp, row.pccNumber, row.retailer, row.method, row.result, row.screener, row.reference, row.quarantineReason, row.notes].map((value) => escape(value ?? "")).join(","));
      const csv = [
        `Attestation statement,"${escape(STATEMENT)}"`,
        "",
        "OPERATOR ACTION LOG",
        eventHeader.join(","),
        ...eventCsv,
        "",
        "SECURITY SCREENING EVIDENCE",
        screeningHeader.join(","),
        ...screeningCsv,
      ].join("\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="terminalflow-attestation-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }
    return Response.json({
      statement: STATEMENT,
      generatedAt: new Date().toISOString(),
      generatedBy: { name: operator.name, role: operator.role },
      totals: { events: rows.length, screeningRecords: screeningRows.length, operators: [...new Set(rows.map((row) => row.operator))].length },
      events: rows,
      screening: screeningRows,
    });
  } catch (error) {
    console.error("Failed to build attestation", error);
    return Response.json({ error: "Could not build the attestation report." }, { status: 500 });
  }
}
