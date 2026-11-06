import { db } from "@/db";
import { mailMessages } from "@/db/schema";
import { currentOperator } from "@/lib/auth";
import { listMailboxMessages, mailConfigured } from "@/lib/mail";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const operator = await currentOperator();
    if (!operator) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (!mailConfigured()) {
      return Response.json({ configured: false, messages: [], hint: "Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and MS_MAILBOX to connect the Outlook operations mailbox." });
    }
    const messages = await listMailboxMessages(25);
    if (messages.length) {
      await db.insert(mailMessages).values(messages.map((message) => ({
        internetMessageId: message.internetMessageId,
        fromAddress: message.from.emailAddress.address,
        subject: message.subject.slice(0, 240),
        bodyPreview: message.bodyPreview ?? "",
        receivedAt: new Date(message.receivedDateTime),
      }))).onConflictDoUpdate({
        target: mailMessages.internetMessageId,
        set: {
          subject: sql`excluded.subject`,
          bodyPreview: sql`excluded.body_preview`,
          receivedAt: sql`excluded.received_at`,
        },
      });
    }
    const stored = await db.select().from(mailMessages).orderBy(desc(mailMessages.receivedAt)).limit(40);
    return Response.json({ configured: true, messages: stored });
  } catch (error) {
    console.error("Failed to read mailbox", error);
    const message = error instanceof Error ? error.message : "Could not read the mailbox.";
    return Response.json({ configured: mailConfigured(), messages: [], error: message }, { status: 502 });
  }
}
