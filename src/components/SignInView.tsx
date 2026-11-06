"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Boxes, Eye, EyeOff, LockKeyhole, RefreshCw, ShieldCheck, UserRound, Warehouse } from "lucide-react";
import type { Operator } from "@/lib/types";
import { authFetch as fetch, setAuthToken } from "@/lib/client-auth";

type OperatorOption = { id: string; name: string; role: string; roleLabel: string; isDemo: boolean };

export default function SignInView({ onSignedIn }: { onSignedIn: (operator: Operator) => void }) {
  const [options, setOptions] = useState<OperatorOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [setupMessage, setSetupMessage] = useState("");
  const [demoHints, setDemoHints] = useState<Record<string, string>>({});
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const pinInput = useRef<HTMLInputElement>(null);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    setError("");
    try {
      const response = await fetch("/api/auth", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load operators.");
      const available: OperatorOption[] = data.options ?? [];
      setOptions(available);
      setDemoHints(data.demoHints ?? {});
      setSetupMessage(data.configured ? "" : "No operator accounts are configured. Ask your administrator to set a bootstrap manager account.");
      if (available.length === 1) setSelectedId(available[0].id);
    } catch (e) {
      setOptions([]);
      setSetupMessage(e instanceof Error ? e.message : "Could not load sign-in options.");
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => { void loadOptions(); }, [loadOptions]);

  function choose(option: OperatorOption) {
    setSelectedId(option.id);
    setPin(option.isDemo ? demoHints[option.id] ?? "" : "");
    setError("");
    requestAnimationFrame(() => pinInput.current?.focus());
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) {
      setError("Select your operator before signing in.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId: selectedId, pin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not sign in");
      setAuthToken(typeof data.token === "string" ? data.token : null);
      onSignedIn(data.operator);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return <div className="signin-shell">
    <div className="signin-card">
      <div className="signin-brand"><div className="brand-icon"><Boxes size={22} strokeWidth={2.2}/></div><div className="brand-copy"><strong>terminal<span>flow.</span></strong><small>CONSOLIDATION OS</small></div></div>
      <h1>Operator sign-in</h1>
      <p className="signin-lead">Select your operator account and enter your PIN. Every screening decision, variance and dispatch release is recorded against your identity.</p>

      <div className="signin-options-head"><span>Select operator</span><button type="button" className="signin-refresh" onClick={() => void loadOptions()} disabled={loadingOptions} aria-label="Refresh operator list"><RefreshCw size={14}/></button></div>
      {loadingOptions && <div className="signin-options-loading"><span className="spinner"/> Loading operator accounts...</div>}
      {!loadingOptions && options.length > 0 && <div className="signin-operator-list" role="listbox" aria-label="Operator accounts">
        {options.map((option) => <button type="button" role="option" aria-selected={selectedId === option.id} key={option.id} className={`signin-operator ${selectedId === option.id ? "selected" : ""}`} onClick={() => choose(option)}>
          <span className="demo-avatar">{option.name.split(" ").map((part) => part[0]).join("")}</span>
          <span className="demo-name">{option.name}<small>{option.roleLabel}</small></span>
          {option.isDemo && <span className="demo-label">Demo</span>}
          {option.isDemo && demoHints[option.id] && <span className="demo-pin">PIN {demoHints[option.id]}</span>}
          <span className={`operator-radio ${selectedId === option.id ? "checked" : ""}`}/>
        </button>)}
      </div>}
      {!loadingOptions && !options.length && <div className="signin-setup-message"><ShieldCheck size={17}/><span>{setupMessage || "No active operator accounts are available."}</span></div>}

      <form onSubmit={submit} className="signin-form">
        <label className="field">Operator PIN
          <span className="signin-pin-wrap"><input ref={pinInput} required type={showPin ? "text" : "password"} inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder={selectedId ? "Enter your PIN" : "Select an operator first"} disabled={!selectedId || busy} aria-label="Operator PIN"/><button type="button" onClick={() => setShowPin(!showPin)} aria-label={showPin ? "Hide PIN" : "Show PIN"} disabled={!selectedId}><span className="pin-eye">{showPin ? <EyeOff size={17}/> : <Eye size={17}/>}</span></button></span>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button signin-submit" disabled={busy || !selectedId || !pin}>{busy ? "Signing in..." : <><LockKeyhole size={17}/> Sign in</>}</button>
      </form>
      <div className="signin-secure-note"><UserRound size={14}/> Shared workstation? Sign out when your shift ends.</div>
      <div className="signin-foot"><Warehouse size={14}/> JFK Consolidation Center · terminal retail goods</div>
    </div>
  </div>;
}
