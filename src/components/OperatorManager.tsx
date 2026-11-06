"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, KeyRound, LoaderCircle, Plus, ShieldCheck, UserPlus, UserRound, UserRoundX } from "lucide-react";
import { ROLES } from "@/lib/workflow";
import type { Operator } from "@/lib/types";
import { authFetch as fetch } from "@/lib/client-auth";

type ManagedOperator = { id: string; name: string; role: string; active: boolean; isDemo: boolean; createdAt: string };
const roleOptions = Object.entries(ROLES) as [string, string][];
const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

export default function OperatorManager({ actor, notify }: { actor: Operator; notify: (message: string) => void }) {
  const [records, setRecords] = useState<ManagedOperator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", role: "receiver", pin: "", confirmPin: "" });
  const [resetId, setResetId] = useState("");
  const [newPin, setNewPin] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/operators", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load operators.");
      setRecords(data.operators);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load operators.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createOperator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    if (form.pin.length < 8) { setError("Operator PIN must be at least 8 characters."); setBusy(false); return; }
    if (form.pin !== form.confirmPin) { setError("PIN confirmation does not match."); setBusy(false); return; }
    try {
      const response = await fetch("/api/operators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, role: form.role, pin: form.pin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create operator.");
      setForm({ name: "", role: "receiver", pin: "", confirmPin: "" });
      notify(`Operator ${data.operator.name} added`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create operator.");
    } finally {
      setBusy(false);
    }
  }

  async function updateOperator(id: string, body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/operators/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update operator.");
      setResetId("");
      setNewPin("");
      notify(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update operator.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel operator-manager">
    <div className="panel-header"><div><h2>Operator sign-in options</h2><p>Manage the accounts staff can use to sign in</p></div><span className="operator-count"><UserRound size={14}/>{records.filter((record) => record.active && !record.isDemo).length} company accounts</span></div>
    <div className="operator-list">
      {loading && <div className="operator-loading"><LoaderCircle size={17}/> Loading operator accounts...</div>}
      {!loading && records.map((record) => <div className={`managed-operator ${!record.active ? "inactive" : ""}`} key={record.id}>
        <div className="managed-avatar">{initials(record.name)}</div>
        <div className="managed-identity"><strong>{record.name}{record.id === actor.id && <span className="you-tag">YOU</span>}</strong><small>{ROLES[record.role as keyof typeof ROLES] ?? record.role}{record.isDemo && <span className="demo-label">Demo</span>}</small></div>
        <span className={`operator-state ${record.active ? "active" : ""}`}>{record.active ? "Active" : "Disabled"}</span>
        <div className="operator-actions">
          <button type="button" className="operator-action" onClick={() => { setResetId(resetId === record.id ? "" : record.id); setNewPin(""); }} aria-label={`Reset PIN for ${record.name}`} title="Reset PIN"><KeyRound size={15}/></button>
          <button type="button" className={`operator-action ${record.active ? "deactivate" : "activate"}`} disabled={busy || (record.id === actor.id && record.active)} onClick={() => void updateOperator(record.id, { active: !record.active }, `${record.name} ${record.active ? "disabled" : "enabled"}`)} aria-label={`${record.active ? "Disable" : "Enable"} ${record.name}`} title={record.active ? "Disable account" : "Enable account"}>{record.active ? <UserRoundX size={15}/> : <Check size={15}/>}</button>
        </div>
        {resetId === record.id && <form className="pin-reset-form" onSubmit={(event) => { event.preventDefault(); if (newPin.length < 8) { setError("PIN must be at least 8 characters."); return; } void updateOperator(record.id, { pin: newPin }, `PIN reset for ${record.name}`); }}><label className="field">New PIN <input required minLength={8} autoComplete="new-password" type="password" value={newPin} onChange={(event) => setNewPin(event.target.value)} placeholder="At least 8 characters"/></label><button className="secondary-button" type="submit" disabled={busy}><KeyRound size={14}/> Reset PIN</button></form>}
      </div>)}
      {!loading && records.length === 0 && <div className="operator-loading">No operator accounts found.</div>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <details className="operator-add"><summary><UserPlus size={15}/> Add operator account</summary><form onSubmit={createOperator} className="operator-add-form">
      <label className="field">Full name <input required minLength={2} maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Employee name"/></label>
      <label className="field">Warehouse role <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roleOptions.map(([role, label]) => <option value={role} key={role}>{label}</option>)}</select></label>
      <label className="field">Initial PIN <input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={form.pin} onChange={(event) => setForm({ ...form, pin: event.target.value })} placeholder="At least 8 characters"/></label>
      <label className="field">Confirm PIN <input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={form.confirmPin} onChange={(event) => setForm({ ...form, confirmPin: event.target.value })} placeholder="Enter PIN again"/></label>
      <button className="primary-button" type="submit" disabled={busy}><Plus size={16}/> Add operator</button>
      <p className="operator-security-note"><ShieldCheck size={14}/> PINs are stored as salted hashes; they are never shown again.</p>
    </form></details>
  </section>;
}
