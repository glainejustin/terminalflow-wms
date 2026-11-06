"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Check, CheckCheck, ClipboardList, LockKeyhole, Mail, Package, Plus, ShieldCheck, Store, Truck, Warehouse, X } from "lucide-react";
import { allowedActions, SCREENING_METHODS, VARIANCE_REASONS } from "@/lib/workflow";
import type { Operator, Order, OrderEvent, OrderLine, ScreeningRecord } from "@/lib/types";
import { authFetch as fetch } from "@/lib/client-auth";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const format = (n: number) => new Intl.NumberFormat("en-US").format(n);
const stamp = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

type Detail = { order: Order; lines: OrderLine[]; screening: ScreeningRecord[]; events: OrderEvent[] };

export default function OrderSheet({ orderId, operator, onClose, onChanged, notify }: { orderId: string; operator: Operator; onClose: () => void; onChanged: () => void; notify: (message: string) => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"manifest" | "screening" | "history">("manifest");
  const [note, setNote] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [zone, setZone] = useState("");
  const [seal, setSeal] = useState("");
  const [receiving, setReceiving] = useState<{ lineId: string; unitsReceived: string; unitsDamaged: string; varianceReason: string } | null>(null);
  const [newLine, setNewLine] = useState({ sku: "", description: "", unitsExpected: "", cages: "" });
  const [screeningForm, setScreeningForm] = useState<{ method: string; result: string; reference: string; notes: string; quarantineReason: string }>({ method: SCREENING_METHODS[0], result: "cleared", reference: "", notes: "", quarantineReason: "" });

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load this order");
      setDetail(data);
      setZone(data.order.storageZone.startsWith("Warehouse") || data.order.storageZone.startsWith("Secure") || data.order.storageZone.startsWith("Ambient") ? data.order.storageZone : "Warehouse A-01");
      setSeal(data.order.sealNumber ?? "");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this order");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  async function transition(status: string) {
    if (!detail) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${detail.order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, expectedVersion: detail.order.version, note, storageZone: zone, quarantineReason: holdReason, sealNumber: seal }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update the order");
      setNote("");
      setHoldReason("");
      setSeal("");
      notify(`${detail.order.pccNumber} → ${status}`);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the order");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveReceiving() {
    if (!detail || !receiving) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${detail.order.id}/lines/${receiving.lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitsReceived: Number(receiving.unitsReceived), unitsDamaged: Number(receiving.unitsDamaged || 0), varianceReason: receiving.varianceReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not record receiving");
      setReceiving(null);
      notify("Receiving recorded");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record receiving");
    } finally {
      setBusy(false);
    }
  }

  async function addLine() {
    if (!detail) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${detail.order.id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newLine, unitsExpected: Number(newLine.unitsExpected), cages: Number(newLine.cages || 0) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add the line");
      setNewLine({ sku: "", description: "", unitsExpected: "", cages: "" });
      notify("Manifest line added");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the line");
    } finally {
      setBusy(false);
    }
  }

  async function recordScreening() {
    if (!detail) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${detail.order.id}/screening`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(screeningForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not record screening");
      setScreeningForm({ method: SCREENING_METHODS[0], result: "cleared", reference: "", notes: "", quarantineReason: "" });
      notify("Screening evidence recorded");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record screening");
    } finally {
      setBusy(false);
    }
  }

  async function emailStore() {
    if (!detail) return;
    setBusy(true);
    try {
      const response = await fetch("/api/mailbox/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: detail.order.storeEmail,
          subject: `Goods delivery update — ${detail.order.pccNumber}`,
          body: `<p>Order <strong>${detail.order.pccNumber}</strong> is currently <strong>${detail.order.status}</strong>.</p><p>Destination store: ${detail.order.store}<br/>Terminal: ${detail.order.terminal}<br/>Expected at store: ${stamp(detail.order.expectedDelivery)}</p><p>Sent by ${operator.name} from the JFK Consolidation Center.</p>`,
          orderId: detail.order.id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send the message");
      notify("Store notified by email");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the message");
    } finally {
      setBusy(false);
    }
  }

  const order = detail?.order;
  const lines = detail?.lines ?? [];
  const actions = order ? allowedActions(order.status, operator.role) : [];
  const expectedTotal = lines.reduce((n, line) => n + line.unitsExpected, 0);
  const receivedTotal = lines.reduce((n, line) => n + line.unitsReceived, 0);
  const damagedTotal = lines.reduce((n, line) => n + line.unitsDamaged, 0);
  const valueTotal = lines.reduce((n, line) => n + line.unitsReceived * line.unitValueCents, 0);
  const receivingComplete = lines.length > 0 && lines.every((line) => line.receivedAt);

  return <div className="overlay" onMouseDown={onClose}><aside className="detail-drawer" onMouseDown={(e) => e.stopPropagation()}>
    <div className="drawer-top"><span>RETAILER ORDER DETAILS</span><button className="close-button" onClick={onClose} aria-label="Close details"><X size={20}/></button></div>
    {loading && <div className="table-empty"><span className="spinner"/><strong>Loading order...</strong></div>}
    {error && <div className="sheet-error"><AlertTriangle size={15}/> {error}</div>}
    {order && <div className="drawer-body">
      <div className="sheet-head">
        <div className="drawer-symbol inbound"><Package size={26}/></div>
        <div className="sheet-head-text"><h2>{order.pccNumber}</h2><p className="drawer-customer">{order.retailer} · {order.category}</p></div>
        <div className="sheet-badges"><span className={`status-badge stage-${order.status.toLowerCase().replaceAll(" ", "-")}`}><i/>{order.status}</span><span className={`screening-indicator screening-${order.screening.toLowerCase().replaceAll(" ", "-")}`}><i/>{order.screening}</span></div>
      </div>
      <div className="drawer-route retail-route"><div><small>FROM</small><strong>Center</strong></div><div className="route-line"><Truck size={18}/></div><div><small>TO</small><strong>{order.terminal}</strong></div></div>
      <div className="store-destination"><Store size={16}/><span>Destination store</span><strong>{order.store}</strong></div>
      <div className="drawer-data">
        <div><span>Supplier</span><strong>{order.supplier}</strong></div>
        <div><span>Manifest lines</span><strong>{lines.length} · {expectedTotal} units expected</strong></div>
        <div><span>Received</span><strong className={receivedTotal !== expectedTotal ? "priority-urgent" : ""}>{receivedTotal} units{damagedTotal ? ` · ${damagedTotal} damaged` : ""}</strong></div>
        <div><span>Cages</span><strong>{order.cages} × {order.cageType}</strong></div>
        <div><span>Temperature class</span><strong>{order.temperatureClass}</strong></div>
        <div><span>Total weight</span><strong>{format(order.weightKg)} kg</strong></div>
        <div><span>Supplier docket</span><strong>{order.supplierDocket || "—"}</strong></div>
        <div><span>Duty status</span><strong className={order.dutyStatus === "Bonded" ? "priority-urgent" : ""}>{order.dutyStatus}</strong></div>
        <div><span>Goods value</span><strong>{money(valueTotal)}</strong></div>
        <div><span>Priority</span><strong className={order.priority === "High" ? "priority-urgent" : ""}>{order.priority}</strong></div>
        <div><span>Cage seal</span><strong>{order.sealNumber || "Not sealed"}</strong></div>
        <div><span>Current location</span><strong>{order.storageZone}</strong></div>
        <div><span>Received at center</span><strong>{stamp(order.receivedAt)}</strong></div>
        <div><span>Expected at store</span><strong>{stamp(order.expectedDelivery)}</strong></div>
        {order.dispatchedAt && <div><span>Dispatched to airport</span><strong>{stamp(order.dispatchedAt)}</strong></div>}
        {order.deliveredAt && <div><span>Delivered to store</span><strong>{stamp(order.deliveredAt)}</strong></div>}
      </div>
      {order.notes && <><h3>Handling notes</h3><p className="drawer-notes">{order.notes}</p></>}

      <div className="sheet-tabs">
        <button className={tab === "manifest" ? "active" : ""} onClick={() => setTab("manifest")}><ClipboardList size={15}/> Manifest</button>
        <button className={tab === "screening" ? "active" : ""} onClick={() => setTab("screening")}><ShieldCheck size={15}/> Screening</button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><LockKeyhole size={15}/> Audit trail</button>
      </div>

      {tab === "manifest" && <>
        <div className="sheet-summary"><span>{lines.length} lines</span><span className={receivedTotal !== expectedTotal ? "variance-flag" : ""}>{receivedTotal} of {expectedTotal} units received</span></div>
        <div className="line-list">
          {lines.map((line) => {
            const variance = line.unitsReceived !== line.unitsExpected;
            const isReceiving = receiving?.lineId === line.id;
            return <div className={`line-row ${variance ? "has-variance" : ""}`} key={line.id}>
              <div className="line-main"><strong>{line.description}</strong><span>{line.sku}{line.barcode ? ` · ${line.barcode}` : ""}</span></div>
              <div className="line-counts">
                <span className="line-count"><small>Expected</small><strong>{line.unitsExpected}</strong></span>
                <span className="line-count"><small>Received</small><strong className={variance ? "variance-text" : ""}>{line.unitsReceived}</strong></span>
              </div>
              {line.receivedAt ? <span className="line-received">{line.receivedBy} · {stamp(line.receivedAt)}</span> : <button className="line-action" onClick={() => setReceiving(isReceiving ? null : { lineId: line.id, unitsReceived: String(line.unitsExpected), unitsDamaged: "0", varianceReason: "" })}>{isReceiving ? "Cancel" : "Record receiving"}</button>}
              {variance && <div className="line-variance"><AlertTriangle size={13}/> {line.varianceReason || "Variance recorded"} · {line.unitsExpected - line.unitsReceived > 0 ? `${line.unitsExpected - line.unitsReceived} short` : `${line.unitsReceived - line.unitsExpected} over`}{line.unitsDamaged ? ` · ${line.unitsDamaged} damaged` : ""}</div>}
              {isReceiving && <div className="receiving-form">
                <label className="field">Units received <input type="number" min="0" value={receiving.unitsReceived} onChange={(e) => setReceiving({ ...receiving, unitsReceived: e.target.value })}/></label>
                <label className="field">Damaged <input type="number" min="0" value={receiving.unitsDamaged} onChange={(e) => setReceiving({ ...receiving, unitsDamaged: e.target.value })}/></label>
                <label className="field full">Variance reason <select value={receiving.varianceReason} onChange={(e) => setReceiving({ ...receiving, varianceReason: e.target.value })}><option value="">No variance</option>{VARIANCE_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
                <button className="primary-button" disabled={busy} onClick={saveReceiving}><Check size={16}/> Save receiving</button>
              </div>}
            </div>;
          })}
          {!lines.length && <div className="empty-mini">No manifest lines yet.</div>}
        </div>
        <details className="add-line"><summary><Plus size={14}/> Add manifest line</summary><div className="add-line-grid">
          <label className="field">SKU <input value={newLine.sku} onChange={(e) => setNewLine({ ...newLine, sku: e.target.value })} placeholder="SKU-100"/></label>
          <label className="field">Description <input value={newLine.description} onChange={(e) => setNewLine({ ...newLine, description: e.target.value })} placeholder="Product name"/></label>
          <label className="field">Expected units <input type="number" min="1" value={newLine.unitsExpected} onChange={(e) => setNewLine({ ...newLine, unitsExpected: e.target.value })}/></label>
          <label className="field">Cages <input type="number" min="0" value={newLine.cages} onChange={(e) => setNewLine({ ...newLine, cages: e.target.value })}/></label>
          <button className="secondary-button" disabled={busy} onClick={addLine}>Add line</button>
        </div></details>
      </>}

      {tab === "screening" && <>
        <div className="screening-list">
          {detail?.screening.map((record) => <div className={`screening-record result-${record.result}`} key={record.id}>
            <div className="screening-record-head"><strong>{record.method}</strong><span className={`screening-indicator screening-${record.result === "cleared" ? "cleared" : "failed"}`}><i/>{record.result}</span></div>
            <span className="screening-meta">{record.screenerName} · {stamp(record.createdAt)}{record.reference ? ` · ${record.reference}` : ""}</span>
            {record.notes && <p>{record.notes}</p>}
            {record.quarantineReason && <p className="hold-reason"><AlertTriangle size={13}/> {record.quarantineReason}</p>}
          </div>)}
          {!detail?.screening.length && <div className="empty-mini">No screening evidence recorded yet.</div>}
        </div>
        {["manager", "screener"].includes(operator.role) && <div className="screening-form">
          <h4>Record screening</h4>
          <div className="form-grid">
            <label className="field">Method <select value={screeningForm.method} onChange={(e) => setScreeningForm({ ...screeningForm, method: e.target.value })}>{SCREENING_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
            <label className="field">Result <select value={screeningForm.result} onChange={(e) => setScreeningForm({ ...screeningForm, result: e.target.value })}><option value="cleared">Cleared</option><option value="referred">Referred for further check</option><option value="failed">Failed</option></select></label>
            <label className="field">Reference <input value={screeningForm.reference} onChange={(e) => setScreeningForm({ ...screeningForm, reference: e.target.value })} placeholder="e.g. XR-4471"/></label>
            <label className="field">Notes <input value={screeningForm.notes} onChange={(e) => setScreeningForm({ ...screeningForm, notes: e.target.value })} placeholder="Optional"/></label>
            {screeningForm.result !== "cleared" && <label className="field full">Quarantine reason <input required value={screeningForm.quarantineReason} onChange={(e) => setScreeningForm({ ...screeningForm, quarantineReason: e.target.value })} placeholder="Reason goods are held"/></label>}
          </div>
          <button className="primary-button" disabled={busy} onClick={recordScreening}><ShieldCheck size={16}/> Record screening</button>
        </div>}
      </>}

      {tab === "history" && <div className="audit-list">
        {detail?.events.map((event) => <div className="audit-row" key={event.id}>
          <div className={`activity-icon ${event.kind}`}>{event.kind === "success" ? <Check size={15}/> : event.kind === "warning" ? <AlertTriangle size={15}/> : event.kind === "purple" ? <Warehouse size={15}/> : <Package size={15}/>}</div>
          <div className="audit-body"><strong>{event.title}</strong><span>{event.detail}</span>{event.note && <em>{event.note}</em>}<small>{event.actor} · {event.actorRole} · {stamp(event.createdAt)}</small></div>
        </div>)}
        {!detail?.events.length && <div className="empty-mini">No recorded activity.</div>}
      </div>}

      <h3>Next step</h3>
      {actions.length > 0 && <div className="drawer-actions">
        {actions.some((action) => action.status === "Delivered") && <label className="field">Proof of handover note <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Received by store staff, count confirmed"/></label>}
        {actions.some((action) => action.status === "On hold") && <label className="field">Quarantine reason <input value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="Why are these goods held?"/></label>}
        {actions.some((action) => action.status === "In storage") && <label className="field">Warehouse location <input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="e.g. Secure S-02"/></label>}
        {actions.some((action) => action.status === "In transit") && <label className="field">Cage seal number <input value={seal} onChange={(e) => setSeal(e.target.value)} placeholder="Applied before goods leave for the airport"/></label>}
        {actions.filter((action) => action.status !== "Delivered" && action.status !== "On hold" && action.status !== "In storage").map((action) => <button key={action.status} disabled={busy} className="action-button" onClick={() => transition(action.status)}>{action.status === "In transit" ? <Truck size={17}/> : action.status === "Delivered" ? <Store size={17}/> : <ArrowRight size={17}/>} {action.label}<ArrowRight size={15}/></button>)}
        {actions.filter((action) => action.status === "In storage" || action.status === "On hold" || action.status === "Delivered").map((action) => <button key={action.status} disabled={busy} className={action.status === "On hold" ? "action-button hold" : "action-button"} onClick={() => transition(action.status)}>{action.status === "Delivered" ? <Store size={17}/> : action.status === "On hold" ? <LockKeyhole size={17}/> : <Warehouse size={17}/>} {action.label}<ArrowRight size={15}/></button>)}
      </div>}
      {order.status === "Delivered" && <div className="completed-message"><CheckCheck size={18}/> Delivery confirmed at {order.store}</div>}
      {actions.length === 0 && order.status !== "Delivered" && <p className="screening-note"><LockKeyhole size={14}/> No action is available to your role at this stage. A center manager or the relevant operator can continue.</p>}
      {order.screening !== "Cleared" && ["Received", "Awaiting screening", "Screening", "On hold"].includes(order.status) && <p className="screening-note"><LockKeyhole size={14}/> Goods cannot be dispatched until screening is cleared.</p>}
      {!receivingComplete && order.status === "Ready for dispatch" && <p className="screening-note"><AlertTriangle size={14}/> Receiving is not complete on every line. Dispatch requires a completed receiving count.</p>}
    </div>}
    <div className="drawer-footer">
      <button className="delete-button" onClick={emailStore} disabled={busy}><Mail size={17}/> Email store</button>
      <button className="primary-button" onClick={onClose}>Done <Check size={16}/></button>
    </div>
  </aside></div>;
}
