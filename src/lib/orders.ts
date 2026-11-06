import { db } from "@/db";
import { orders, orderLines, orderEvents } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/** Recomputes the order summary from its lines so headline figures always match the manifest. */
export async function recalcOrderSummary(orderId: string) {
  const [totals] = await db
    .select({
      cages: sql<number>`coalesce(sum(${orderLines.cages}), 0)::int`,
      units: sql<number>`coalesce(sum(${orderLines.unitsExpected}), 0)::int`,
    })
    .from(orderLines)
    .where(eq(orderLines.orderId, orderId));
  const [updated] = await db.update(orders).set({ cages: totals?.cages ?? 0, units: totals?.units ?? 0, updatedAt: new Date() }).where(eq(orders.id, orderId)).returning();
  return updated;
}

export async function logEvent(input: {
  orderId: string | null;
  title: string;
  detail?: string;
  kind?: string;
  actor: string;
  actorRole: string;
  note?: string;
}) {
  await db.insert(orderEvents).values({
    orderId: input.orderId,
    title: input.title,
    detail: input.detail ?? "",
    kind: input.kind ?? "info",
    actor: input.actor,
    actorRole: input.actorRole,
    note: input.note ?? "",
  });
}
