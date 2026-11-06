"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Inbox, Mail, RefreshCw, X } from "lucide-react";
import type { MailMessage } from "@/lib/types";
import { authFetch as fetch } from "@/lib/client-auth";

const stamp = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function MailboxView({ notify, onImported }: { notify: (message: string) => void; onImported: () => void }) {
  const [configured, setConfigured] = useState(true);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [active, setActive] = useState<MailMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ pccNumber: "", retailer: "", store: "", terminal: "Terminal 4", supplier: "", category: "Food & beverage", expectedDelivery: "", manifest: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/mailbox", { cache: "no-store" });
      const data = await response.json();
      setConfigured(Boolean(data.configured));
      setHint(data.hint ?? "");
      setMessages(data.messages ?? []);
      if (data.error) setError(data.error);
      else setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the mailbox");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startImport(message: MailMessage) {
    const reference = message.subject.match(/[A-Z]{2,4}-?\d{3,}/)?.[0] ?? "";
    const terminal = message.subject.match(/T\d/)?.[0] ?? "Terminal 4";
    const manifestLines = message.bodyPreview.split(/\r?\n/).filter((line) => /[|,\t]/.test(line) && /\d/.test(line));
    setActive(message);
    setForm({
      pccNumber: reference ? reference.toUpperCase() : "",
      retailer: "",
      store: "",
      terminal: terminal === "T4" ? "Terminal 4" : terminal === "T5" ? "Terminal 5" : terminal === "T7" ? "Terminal 7" : terminal === "T8" ? "Terminal 8" : "Terminal 1",
      supplier: "",
      category: "Food & beverage",
      expectedDelivery: "",
      manifest: manifestLines.join("\n"),
    });
  }

  async function importOrder() {
    if (!active) return;
    setBusy(true);
    try {
      const lines = form.manifest.split(/\r?\n/).map((line) => {
        const match = line.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]{2,})\s*[|,\t]\s*(.+?)\s*[|,\t]\s*(\d{1,6})\s*$/);
        return match ? { sku: match[1].trim(), description: match[2].trim(), unitsExpected: Number(match[3]) } : null;
      }).filter((line): line is { sku: string; description: string; unitsExpected: number } => Boolean(line));
      const response = await fetch("/api/mailbox/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, internetMessageId: active.internetMessageId, expectedDelivery: form.expectedDelivery ? new Date(form.expectedDelivery).toISOString() : new Date(Date.now() + 86400000).toISOString(), lines }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not import the order");
      setActive(null);
      notify(`${data.order.pccNumber} imported from email`);
      await load();
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import the order");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel mailbox-panel">
    <div className="panel-header"><div><h2>Outlook operations mailbox</h2><p>Supplier manifests and retailer instructions arrive by email</p></div><button className="export-button" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
    {!configured && <div className="mailbox-setup"><AlertTriangle size={16}/><div><strong>Mailbox not connected</strong><p>{hint || "Add the Microsoft Graph credentials to the environment to read and send mail."}</p></div></div>}
    {error && <div className="sheet-error"><AlertTriangle size={15}/> {error}</div>}
    {loading && <div className="table-empty"><span className="spinner"/><strong>Reading mailbox...</strong></div>}
    {!loading && messages.length === 0 && configured && <div className="table-empty"><Inbox size={28}/><strong>No messages waiting</strong><span>New supplier emails will appear here.</span></div>}
    <div className="mail-list">
      {messages.map((message) => <div className="mail-row" key={message.id}>
        <div className="mail-icon"><Mail size={17}/></div>
        <div className="mail-body">
          <div className="mail-head"><strong>{message.subject || "(no subject)"}</strong><span>{stamp(message.receivedAt)}</span></div>
          <span className="mail-from">{message.fromAddress}</span>
          <p className="mail-preview">{message.bodyPreview}</p>
        </div>
        {message.status === "imported" ? <span className="mail-imported">Imported · {message.importedPccNumber}</span> : <button className="export-button" onClick={() => startImport(message)}>Import as order</button>}
      </div>)}
    </div>
    {active && <div className="overlay modal-overlay" onMouseDown={() => setActive(null)}><div className="create-modal" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-header"><div><div className="eyebrow"><span className="eyebrow-line"/> EMAIL TO ORDER</div><h2>Import supplier manifest</h2><p>{active.subject}</p></div><button className="close-button" onClick={() => setActive(null)} aria-label="Close"><X size={20}/></button></div>
      <div className="modal-fields">
        <label className="field">PCC number <input required value={form.pccNumber} onChange={(e) => setForm({ ...form, pccNumber: e.target.value })} placeholder="PCC-10490"/></label>
        <label className="field">Retailer <input required value={form.retailer} onChange={(e) => setForm({ ...form, retailer: e.target.value })} placeholder="e.g. Hudson"/></label>
        <label className="field">Destination store <input required value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} placeholder="e.g. Hudson News T5"/></label>
        <label className="field">Terminal <select value={form.terminal} onChange={(e) => setForm({ ...form, terminal: e.target.value })}><option>Terminal 1</option><option>Terminal 4</option><option>Terminal 5</option><option>Terminal 7</option><option>Terminal 8</option></select></label>
        <label className="field">Supplier <input required value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="e.g. Ingram Content Group"/></label>
        <label className="field">Category <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>Food & beverage</option><option>Beauty & fragrance</option><option>Books & magazines</option><option>Fashion & accessories</option><option>Toys & gifts</option><option>Electronics</option><option>Other</option></select></label>
        <label className="field">Expected store delivery <input type="datetime-local" value={form.expectedDelivery} onChange={(e) => setForm({ ...form, expectedDelivery: e.target.value })}/></label>
        <label className="field full">Manifest lines <textarea rows={4} value={form.manifest} onChange={(e) => setForm({ ...form, manifest: e.target.value })} placeholder="SKU-100 | Product name | 24"/></label>
      </div>
      <div className="modal-footer"><button className="secondary-button" onClick={() => setActive(null)}>Cancel</button><button className="primary-button" disabled={busy} onClick={importOrder}>{busy ? "Importing..." : "Import order"}</button></div>
    </div></div>}
  </section>;
}
