import { db } from "@/db";
import { orders } from "@/db/schema";
import { currentOperator } from "@/lib/auth";
import { mailConfigured, sendMailboxMessage } from "@/lib/mail";
import { logEvent } from "@/lib/orders";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (!mailConfigured()) return Response.json({ error: "The Outlook mailbox is not connected yet." }, { status: 400 });
    const body = await request.json();
    const to = String(body.to || "").trim();
    const subject = String(body.subject || "").trim();
    const content = String(body.body || "").trim();
    const orderId = String(body.orderId || "");
    if (!to || !subject || !content) return Response.json({ error: "Recipient, subject and message are required." }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return Response.json({ error: "Enter a valid recipient address." }, { status: 400 });
    await sendMailboxMessage({ to, subject, body: content });
    if (orderId) {
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (order) {
        await logEvent({ orderId, title: "Notification emailed", detail: `${order.pccNumber} · ${to}`, kind: "info", actor: operator.name, actorRole: operator.role });
      }
    }
    return Response.json({ sent: true });
  } catch (error) {
    console.error("Failed to send email", error);
    const message = error instanceof Error ? error.message : "Could not send the message.";
    return Response.json({ error: message }, { status: 502 });
  }
}
