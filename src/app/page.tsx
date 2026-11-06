"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, ArrowUpRight, Bell, Boxes, CalendarDays, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardCheck, Download, FileBarChart2, Filter, LayoutDashboard, LogOut, Mail, Menu, MoreHorizontal, Package, Plus, Search, Settings2, ShieldCheck, Store, Trash2, Truck, Warehouse, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import SignInView from "@/components/SignInView";
import OrderSheet from "@/components/OrderSheet";
import MailboxView from "@/components/MailboxView";
import OperatorManager from "@/components/OperatorManager";
import type { Operator, Order, OrderEvent, Stats } from "@/lib/types";
import { CAGE_TYPES, DUTY_STATUSES, TEMPERATURE_CLASSES } from "@/lib/workflow";
import { authFetch as fetch, clearAuthToken } from "@/lib/client-auth";

type View = "Overview" | "All orders" | "Receiving" | "Screening" | "Warehouse" | "Dispatch" | "Store deliveries" | "Mailbox" | "Reports" | "Settings";
type Variance = { pccNumber: string; store: string; sku: string; description: string; unitsExpected: number; unitsReceived: number; varianceReason: string; receivedBy: string };

const nav: { group: string; items: { label: View; icon: LucideIcon }[] }[] = [
  { group: "WORKSPACE", items: [{ label: "Overview", icon: LayoutDashboard }, { label: "All orders", icon: Package }, { label: "Receiving", icon: ClipboardCheck }, { label: "Screening", icon: ShieldCheck }] },
  { group: "OPERATIONS", items: [{ label: "Warehouse", icon: Warehouse }, { label: "Dispatch", icon: Truck }, { label: "Store deliveries", icon: Store }, { label: "Mailbox", icon: Mail }, { label: "Reports", icon: FileBarChart2 }] },
  { group: "GENERAL", items: [{ label: "Settings", icon: Settings2 }] },
];
const stageParam: Partial<Record<View, string>> = { Receiving: "receiving", Screening: "screening", Warehouse: "warehouse", Dispatch: "dispatch", "Store deliveries": "deliveries" };
const stages = ["Received", "Awaiting screening", "Screening", "Cleared", "In storage", "Ready for dispatch", "In transit", "Delivered", "On hold"];
const shortTime = (v: string) => new Date(v).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
const relative = (v: string) => { const m = Math.max(1, Math.round((Date.now() - new Date(v).getTime()) / 60000)); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };
const format = (n: number) => new Intl.NumberFormat("en-US").format(n);
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function HomePage() {
  const [operator, setOperator] = useState<Operator | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<View>("Overview");
  const [orders, setOrders] = useState<Order[]>([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [variance, setVariance] = useState<Variance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All stages");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({ pccNumber: "", retailer: "", store: "", storeEmail: "", terminal: "Terminal 4", supplier: "", category: "Food & beverage", cageType: "Roll cage", temperatureClass: "Ambient", dutyStatus: "Duty paid", weightKg: "", supplierDocket: "", priority: "Standard", expectedDelivery: "", notes: "" });
  const [lines, setLines] = useState<{ sku: string; description: string; unitsExpected: string; cages: string }[]>([{ sku: "", description: "", unitsExpected: "", cages: "" }]);

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!data.operator) clearAuthToken();
        setOperator(data.operator ?? null);
      })
      .finally(() => setAuthReady(true));
  }, []);

  const load = useCallback(async () => {
    if (!operator) return;
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(view === "Overview" ? 8 : 20) });
      const stage = stageParam[view];
      if (stage) params.set("stage", stage);
      if (filter !== "All stages") params.set("search", filter);
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load orders");
      setOrders(data.orders); setEvents(data.events); setStats(data.stats); setVariance(data.variance ?? []); setTotal(data.total); setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, [operator, page, view, filter, search]);

  useEffect(() => { if (operator) load(); }, [operator, load]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(""), 3500); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { setPage(1); }, [view, filter, search]);
  useEffect(() => {
    const onUnauthorized = () => {
      setOperator(null);
      setOrders([]);
      setStats(null);
      setSelectedId(null);
      setError("Your session expired. Sign in again to continue.");
    };
    window.addEventListener("tf:unauthorized", onUnauthorized);
    return () => window.removeEventListener("tf:unauthorized", onUnauthorized);
  }, []);
  const navigate = (destination: View) => { setView(destination); setSearch(""); setFilter("All stages"); setSidebarOpen(false); };
  const notify = (message: string) => setToast(message);

  async function signOut() {
    clearAuthToken();
    await fetch("/api/auth", { method: "DELETE" });
    setOperator(null);
    setOrders([]);
    setStats(null);
    setError("");
  }

  async function createOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setFormError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, expectedDelivery: new Date(form.expectedDelivery).toISOString(), lines: lines.filter((line) => line.sku && line.description).map((line) => ({ ...line, unitsExpected: Number(line.unitsExpected), cages: Number(line.cages || 0) })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not receive order");
      setShowModal(false);
      setForm({ pccNumber: "", retailer: "", store: "", storeEmail: "", terminal: "Terminal 4", supplier: "", category: "Food & beverage", cageType: "Roll cage", temperatureClass: "Ambient", dutyStatus: "Duty paid", weightKg: "", supplierDocket: "", priority: "Standard", expectedDelivery: "", notes: "" });
      setLines([{ sku: "", description: "", unitsExpected: "", cages: "" }]);
      notify(`${data.order.pccNumber} received at center`);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not receive order");
    } finally {
      setBusy(false);
    }
  }

  async function downloadAttestation() {
    try {
      const response = await fetch("/api/reports/attestation?format=csv");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Could not download attestation");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `terminalflow-attestation-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      notify("Attestation downloaded");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not download attestation");
    }
  }

  const pageSize = view === "Overview" ? 8 : 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const journey = [
    { label: "Received", icon: Package, color: "blue", description: "At consolidation center", count: stats?.byStatus.Received ?? 0, view: "Receiving" as View },
    { label: "Screening", icon: ShieldCheck, color: "purple", description: "Security check", count: (stats?.byStatus["Awaiting screening"] ?? 0) + (stats?.byStatus.Screening ?? 0) + (stats?.byStatus["On hold"] ?? 0), view: "Screening" as View },
    { label: "Warehouse", icon: Warehouse, color: "orange", description: "Cleared & stored", count: (stats?.byStatus.Cleared ?? 0) + (stats?.byStatus["In storage"] ?? 0), view: "Warehouse" as View },
    { label: "Dispatch", icon: Truck, color: "blue", description: "To the airport", count: (stats?.byStatus["Ready for dispatch"] ?? 0) + (stats?.byStatus["In transit"] ?? 0), view: "Dispatch" as View },
    { label: "Delivered", icon: Store, color: "green", description: "At terminal store", count: stats?.byStatus.Delivered ?? 0, view: "Store deliveries" as View },
  ];
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const roleLabel = operator?.role === "manager" ? "Center Manager" : operator?.role === "receiver" ? "Goods Receiver" : operator?.role === "screener" ? "Security Screener" : operator?.role === "dispatcher" ? "Dispatcher" : "Store Receiver";

  if (!authReady) return <div className="boot"><span className="spinner"/></div>;
  if (!operator) return <SignInView onSignedIn={(next) => { setOperator(next); setLoading(true); }} />;

  return <div className="app-shell">
    {sidebarOpen && <div className="mobile-scrim" onClick={() => setSidebarOpen(false)}/>}
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="brand" onClick={() => navigate("Overview")} role="button" tabIndex={0}><div className="brand-icon"><Boxes size={22} strokeWidth={2.2}/></div><div className="brand-copy"><strong>terminal<span>flow.</span></strong><small>CONSOLIDATION OS</small></div><button className="mobile-close" onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); }}><X size={19}/></button></div>
      <div className="facility"><div className="facility-icon"><Warehouse size={18}/></div><div className="facility-text"><span>Active center</span><strong>JFK Consolidation</strong></div><ChevronDown size={15}/></div>
      <nav className="sidebar-nav">{nav.map((group) => <div className="nav-group" key={group.group}><div className="nav-group-label">{group.group}</div>{group.items.map((item) => <button key={item.label} className={`nav-item ${view === item.label ? "active" : ""}`} onClick={() => navigate(item.label)}><item.icon size={19} strokeWidth={1.85}/><span>{item.label}</span>{item.label === "All orders" && <span className="nav-count">{stats ? stats.atCenter + stats.inTransit + stats.delivered : 0}</span>}{item.label === "Screening" && (stats?.toScreen ?? 0) > 0 && <span className="nav-count">{stats?.toScreen}</span>}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="support-card"><div className="support-icon"><CircleHelp size={19}/></div><strong>Operations support</strong><p>Every action is recorded against a named operator for audit.</p><button onClick={() => notify("Contact your center operations lead for support")}>Get help <ArrowRight size={14}/></button></div><div className="sidebar-user"><div className="avatar">{operator.name.split(" ").map((part) => part[0]).join("")}</div><div><strong>{operator.name}</strong><small>{roleLabel}</small></div><button className="logout-button" onClick={signOut} aria-label="Sign out"><LogOut size={17}/></button></div></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={22}/></button><div className="breadcrumb">Workspace <ChevronRight size={15}/> <strong>{view}</strong></div></div><div className="topbar-right"><span className="facility-live"><span className="live-dot"/> Center operational</span><div className="topbar-divider"/><div className="notification-wrap"><button className="icon-button notification-button" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label="Notifications"><Bell size={19}/><i/></button>{notificationsOpen && <div className="notification-popover"><div className="popover-heading"><strong>Recent updates</strong><button onClick={() => setNotificationsOpen(false)}><X size={16}/></button></div>{events.slice(0, 5).map((event) => <div className="notification-entry" key={event.id}><span className={`activity-dot ${event.kind}`}/><div><strong>{event.title}</strong><small>{event.detail} · {event.actor}</small></div></div>)}{!events.length && <p>No updates yet.</p>}</div>}</div><div className="top-avatar">{operator.name.split(" ").map((part) => part[0]).join("")}</div></div></header>
      <main className="content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> TERMINAL GOODS OPERATIONS</div><h1>{view === "Overview" ? `Good morning, ${operator.name.split(" ")[0]}` : view}<span className="heading-period">.</span></h1><p>{view === "Overview" ? "From supplier delivery to terminal store — every step recorded." : view === "Mailbox" ? "Read supplier manifests and import them as orders." : view === "Reports" ? "Screening, variance and delivery performance for this center." : view === "Settings" ? "Your consolidation center and operator settings." : "Manage retailer goods at the consolidation center."}</p></div><div className="heading-actions"><span className="date-chip"><CalendarDays size={16}/>{today}</span><button className="primary-button" onClick={() => { setFormError(""); setShowModal(true); }}><Plus size={18} strokeWidth={2.4}/> Receive order</button></div></div>
        {error && <div className="error-banner">{error} <button onClick={load}>Try again</button></div>}

        {view === "Overview" && <>
          <div className="stats-grid">
            <StatCard label="Orders at center" value={stats?.atCenter ?? 0} note="On site now" icon={Package} iconClass="blue" trend="Live inventory" trendType="neutral" spark="6,28 18,24 30,26 42,15 54,20 66,11 78,14 90,5"/>
            <StatCard label="To be screened" value={stats?.toScreen ?? 0} note="Pending security clearance" icon={ShieldCheck} iconClass="purple" trend="Needs attention" trendType="up" spark="6,27 18,23 30,27 42,18 54,20 66,13 78,16 90,6"/>
            <StatCard label="In warehouse" value={stats?.stored ?? 0} note={`${format(stats?.cages ?? 0)} cages stored`} icon={Warehouse} iconClass="orange" trend="Screened & secure" trendType="neutral" spark="6,25 18,28 30,19 42,23 54,15 66,20 78,11 90,8"/>
            <StatCard label="Ready to dispatch" value={stats?.dispatchReady ?? 0} note="Airport transport next" icon={Truck} iconClass="green" trend="Action needed" trendType="up" spark="6,27 18,27 30,18 42,22 54,16 66,16 78,9 90,9"/>
          </div>
          <div className="analytics-grid"><section className="panel flow-panel journey-panel"><div className="panel-header"><div><h2>Order journey</h2><p>Where retailer goods are in the consolidation process</p></div><span className="journey-live"><span className="live-dot"/> Live</span></div><div className="journey-steps">{journey.map((step, index) => <button className="journey-step" key={step.label} onClick={() => navigate(step.view)}><div className="journey-step-top"><div className={`journey-icon ${step.color}`}><step.icon size={19}/></div>{index < journey.length - 1 && <div className="journey-connector"><ArrowRight size={14}/></div>}</div><strong>{step.count}</strong><span>{step.label}</span><small>{step.description}</small></button>)}</div><div className="journey-insight"><ShieldCheck size={18}/><span><strong>Security first.</strong> Goods must be screened and cleared before airport dispatch.</span></div></section>
          <section className="panel activity-panel"><div className="panel-header"><div><h2>Recent activity</h2><p>Every action is signed by an operator</p></div><button className="subtle-icon" onClick={() => navigate("All orders")} aria-label="View orders"><ArrowUpRight size={18}/></button></div><div className="activity-list">{events.slice(0, 4).map((event, index) => <div className="activity-row" key={event.id}><div className={`activity-icon ${event.kind}`}>{event.kind === "success" ? <Check size={16}/> : event.kind === "warning" ? <AlertTriangle size={16}/> : event.kind === "purple" ? <Warehouse size={16}/> : <Package size={16}/>}</div><div className="activity-info"><strong>{event.title}</strong><span>{event.detail}</span><small>{event.actor} · {relative(event.createdAt)}</small></div>{index < Math.min(events.length, 4) - 1 && <div className="activity-connector"/>}</div>)}{!events.length && <div className="empty-mini">Activity will appear here.</div>}</div><button className="activity-footer" onClick={() => navigate("All orders")}>View all orders <ArrowRight size={15}/></button></section></div>
          <div className="analytics-grid variance-grid"><section className="panel variance-panel"><div className="panel-header"><div><h2>Receiving variances</h2><p>Quantity differences at goods receipt</p></div><span className="variance-count">{stats?.varianceLines ?? 0} lines</span></div>{variance.length === 0 && <div className="empty-mini">No variances recorded. All receipts match the manifest.</div>}{variance.map((item) => <div className="variance-row" key={`${item.pccNumber}-${item.sku}`}><div className="variance-icon"><AlertTriangle size={15}/></div><div className="variance-body"><strong>{item.description}</strong><span>{item.pccNumber} · {item.store} · {item.sku}</span><em>{item.varianceReason} · received by {item.receivedBy || "—"}</em></div><div className="variance-counts"><strong>{item.unitsReceived}/{item.unitsExpected}</strong><span>units</span></div></div>)}</section>
          <section className="panel performance-panel"><div className="panel-header"><div><h2>Center performance</h2><p>Delivery and screening indicators</p></div></div><div className="performance-list"><div className="performance-row"><span>On-time store delivery</span><strong>{stats?.onTime === null || stats?.onTime === undefined ? "—" : `${stats.onTime}%`}</strong></div><div className="performance-row"><span>Screening cleared</span><strong>{stats?.screening.cleared ?? 0}</strong></div><div className="performance-row"><span>Referred for further check</span><strong>{stats?.screening.referred ?? 0}</strong></div><div className="performance-row"><span>Units short at receipt</span><strong>{format(stats?.varianceUnits ?? 0)}</strong></div><div className="performance-row"><span>Goods value on site</span><strong>{money(stats?.valueCents ?? 0)}</strong></div></div></section></div>
          <div className="section-title"><div><h2>Recent retailer orders</h2><p>Track goods from center receipt to store handover</p></div><button className="text-link" onClick={() => navigate("All orders")}>View all orders <ArrowRight size={16}/></button></div>
        </>}

        {view === "Reports" && <>
          <div className="stats-grid"><StatCard label="Total orders" value={(stats?.atCenter ?? 0) + (stats?.inTransit ?? 0) + (stats?.delivered ?? 0)} note="All recorded orders" icon={Package} iconClass="blue" trend="Center total" trendType="neutral"/><StatCard label="Units handled" value={stats?.totalUnits ?? 0} note="Across all orders" icon={Boxes} iconClass="purple" trend="Goods received" trendType="neutral"/><StatCard label="Screening cleared" value={stats?.screening.cleared ?? 0} note="Approved for airport" icon={ShieldCheck} iconClass="orange" trend="Screening complete" trendType="up"/><StatCard label="Store deliveries" value={stats?.delivered ?? 0} note="Confirmed handovers" icon={Store} iconClass="green" trend="Completed" trendType="up"/></div>
          <div className="analytics-grid reports-grid"><section className="panel flow-panel journey-panel"><div className="panel-header"><div><h2>Process breakdown</h2><p>Order distribution by operational stage</p></div></div><div className="journey-steps">{journey.map((step, index) => <button className="journey-step" key={step.label} onClick={() => navigate(step.view)}><div className="journey-step-top"><div className={`journey-icon ${step.color}`}><step.icon size={19}/></div>{index < journey.length - 1 && <div className="journey-connector"><ArrowRight size={14}/></div>}</div><strong>{step.count}</strong><span>{step.label}</span><small>{step.description}</small></button>)}</div><div className="journey-insight"><Activity size={18}/><span><strong>{format(stats?.totalUnits ?? 0)} units</strong> processed across {(stats?.atCenter ?? 0) + (stats?.inTransit ?? 0) + (stats?.delivered ?? 0)} retailer orders.</span></div></section><section className="panel breakdown-panel"><div className="panel-header"><div><h2>Screening outcomes</h2><p>Current security status of goods</p></div></div>{["cleared", "referred", "failed"].map((result) => <div className="breakdown-row" key={result}><div><span style={{ textTransform: "capitalize" }}>{result}</span><strong>{stats?.screening[result as "cleared" | "referred" | "failed"] ?? 0}</strong></div><div className="breakdown-track"><div style={{ width: `${(stats?.screening[result as "cleared" | "referred" | "failed"] ?? 0) * 100 / Math.max(1, (stats?.screening.cleared ?? 0) + (stats?.screening.referred ?? 0) + (stats?.screening.failed ?? 0))}%` }}/></div></div>)}<button type="button" className="attestation-link" onClick={downloadAttestation}><Download size={15}/> Download compliance attestation</button><p className="report-footnote">The attestation lists every operator action and screening decision with names, roles and timestamps, for retailer or auditor review.</p></section></div>
          <div className="section-title"><div><h2>Order data</h2><p>Export the records behind your report</p></div></div>
        </>}

        {view === "Mailbox" && <MailboxView notify={notify} onImported={load}/>}

        {view === "Settings" && <div className="settings-layout"><section className="panel settings-panel"><div className="settings-icon"><Warehouse size={24}/></div><h2>Consolidation center</h2><p>Your active retailer goods facility</p><div className="settings-line"><span>Center name</span><strong>JFK Consolidation</strong></div><div className="settings-line"><span>Airport</span><strong>JFK · New York</strong></div><div className="settings-line"><span>Operation</span><strong>Terminal retail goods</strong></div><div className="settings-line"><span>Center status</span><strong className="setting-active"><span className="live-dot"/> Operational</strong></div></section><section className="panel settings-panel"><div className="settings-icon purple"><ShieldCheck size={24}/></div><h2>Your session</h2><p>Signed in for this shift</p><div className="settings-line"><span>Operator</span><strong>{operator.name}</strong></div><div className="settings-line"><span>Role</span><strong>{roleLabel}</strong></div><div className="settings-line"><span>Authorises</span><strong>{operator.role === "manager" ? "All stages" : operator.role === "screener" ? "Screening decisions" : operator.role === "receiver" ? "Receiving & storage" : operator.role === "dispatcher" ? "Dispatch releases" : "Store delivery"}</strong></div><div className="settings-line"><span>Audit trail</span><strong>Enabled for all actions</strong></div></section><section className="panel settings-panel compliance-panel"><div className="settings-icon green"><FileBarChart2 size={24}/></div><h2>Compliance posture</h2><p>How this workflow satisfies retailer and auditor requirements</p><ul className="compliance-list"><li><Check size={14}/> Fixed, rule-based workflow — no model inference and no automated decisions.</li><li><Check size={14}/> No stage advances on its own; each transition requires a named operator and role permission.</li><li><Check size={14}/> Screening clearance, quarantine reasons and receiving variances are recorded as evidence.</li><li><Check size={14}/> A full attestation export is available for retailer and auditor review.</li></ul><button type="button" className="attestation-link" onClick={downloadAttestation}><Download size={15}/> Download attestation (CSV)</button></section></div>}

        {view === "Settings" && operator.role === "manager" && <div className="settings-operator-manager"><OperatorManager actor={operator} notify={notify}/></div>}

        {view !== "Settings" && view !== "Mailbox" && view !== "Reports" && <>
          <section className="panel table-panel"><div className="table-toolbar"><div className="table-toolbar-title"><h2>{view === "Receiving" ? "Newly received goods" : view === "Screening" ? "Security screening queue" : view === "Warehouse" ? "Cleared & stored goods" : view === "Dispatch" ? "Airport dispatch board" : view === "Store deliveries" ? "Store handovers" : "Retailer orders"}</h2><p>{total} order{total === 1 ? "" : "s"} found</p></div><div className="table-tools"><div className="search-field"><Search size={17}/><input placeholder="Search orders..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search orders"/>{search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={14}/></button>}</div><div className="filter-field"><Filter size={15}/><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by stage"><option>All stages</option>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select><ChevronDown size={13}/></div></div></div>
          <div className="table-scroll"><table className="orders-table"><thead><tr><th>PCC / RETAILER</th><th>DESTINATION STORE</th><th>LINES / UNITS</th><th>CAGES</th><th>RECEIVED</th><th>SCREENING</th><th>STAGE</th><th>DELIVERY DUE</th><th></th></tr></thead><tbody>{orders.map((order) => {
            const orderLines = order.lines ?? [];
            const expected = orderLines.reduce((n, line) => n + line.unitsExpected, 0);
            const received = orderLines.reduce((n, line) => n + line.unitsReceived, 0);
            const hasVariance = received !== expected;
            return <tr key={order.id} onClick={() => setSelectedId(order.id)}><td><div className="awb-cell"><div className="shipment-symbol inbound"><Package size={17}/></div><div><strong>{order.pccNumber}</strong><span>{order.retailer}</span></div></div></td><td><strong className="cell-main">{order.store}</strong><span className="cell-muted">{order.terminal}</span></td><td><strong className="cell-main">{orderLines.length} lines · {format(expected)} units</strong><span className="cell-muted">{order.supplier}</span></td><td><strong className="cell-main">{order.cages} × {order.cageType}</strong><span className="cell-muted">{format(order.weightKg)} kg · {order.temperatureClass}</span></td><td><strong className={`cell-main ${hasVariance ? "variance-text" : ""}`}>{format(received)} units</strong><span className="cell-muted">{hasVariance ? "Variance" : "Matches manifest"}</span></td><td><span className={`screening-indicator screening-${order.screening.toLowerCase().replaceAll(" ", "-")}`}><i/>{order.screening}</span></td><td><span className={`status-badge stage-${order.status.toLowerCase().replaceAll(" ", "-")}`}><i/>{order.status}</span></td><td><strong className="cell-main">{shortTime(order.expectedDelivery)}</strong><span className="cell-muted">{order.storageZone}</span></td><td><button className="row-more" aria-label={`View ${order.pccNumber}`} onClick={(e) => { e.stopPropagation(); setSelectedId(order.id); }}><MoreHorizontal size={18}/></button></td></tr>;
          })}</tbody></table>{!loading && orders.length === 0 && <div className="table-empty"><Package size={28}/><strong>No orders found</strong><span>Change your search or filter, or receive a new order.</span></div>}{loading && <div className="table-empty"><span className="spinner"/><strong>Loading orders...</strong></div>}</div>
          <div className="table-footer"><span>Showing {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total} orders</span><div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={17}/></button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={17}/></button></div></div></section>
        </>}

        {view === "Overview" && <section className="panel table-panel table-panel-dashboard"><div className="table-toolbar"><div className="table-toolbar-title"><h2>Latest orders</h2></div><div className="table-tools"><button className="text-link" onClick={() => navigate("All orders")}>View all orders <ArrowRight size={16}/></button></div></div><div className="table-scroll"><table className="orders-table"><thead><tr><th>PCC / RETAILER</th><th>DESTINATION STORE</th><th>LINES / UNITS</th><th>CAGES</th><th>RECEIVED</th><th>SCREENING</th><th>STAGE</th><th>DELIVERY DUE</th><th></th></tr></thead><tbody>{orders.map((order) => {
          const orderLines = order.lines ?? [];
          const expected = orderLines.reduce((n, line) => n + line.unitsExpected, 0);
          const received = orderLines.reduce((n, line) => n + line.unitsReceived, 0);
          return <tr key={order.id} onClick={() => setSelectedId(order.id)}><td><div className="awb-cell"><div className="shipment-symbol inbound"><Package size={17}/></div><div><strong>{order.pccNumber}</strong><span>{order.retailer}</span></div></div></td><td><strong className="cell-main">{order.store}</strong><span className="cell-muted">{order.terminal}</span></td><td><strong className="cell-main">{orderLines.length} lines · {format(expected)} units</strong><span className="cell-muted">{order.supplier}</span></td><td><strong className="cell-main">{order.cages} × {order.cageType}</strong><span className="cell-muted">{format(order.weightKg)} kg · {order.temperatureClass}</span></td><td><strong className={`cell-main ${received !== expected ? "variance-text" : ""}`}>{format(received)} units</strong></td><td><span className={`screening-indicator screening-${order.screening.toLowerCase().replaceAll(" ", "-")}`}><i/>{order.screening}</span></td><td><span className={`status-badge stage-${order.status.toLowerCase().replaceAll(" ", "-")}`}><i/>{order.status}</span></td><td><strong className="cell-main">{shortTime(order.expectedDelivery)}</strong><span className="cell-muted">{order.storageZone}</span></td><td><button className="row-more" aria-label={`View ${order.pccNumber}`} onClick={(e) => { e.stopPropagation(); setSelectedId(order.id); }}><MoreHorizontal size={18}/></button></td></tr>;
        })}</tbody></table></div></section>}

        <div className="bottom-note"><span><span className="live-dot"/> Live center data</span><span>Safe passage from supplier to store.</span></div>
      </main>
    </div>

    {selectedId && <OrderSheet orderId={selectedId} operator={operator} onClose={() => setSelectedId(null)} onChanged={load} notify={notify}/>}

    {showModal && <div className="overlay modal-overlay" onMouseDown={() => setShowModal(false)}><div className="create-modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-header"><div><div className="eyebrow"><span className="eyebrow-line"/> GOODS INBOUND</div><h2>Receive retailer order</h2><p>Record a supplier delivery with its manifest lines.</p></div><button className="close-button" onClick={() => setShowModal(false)} aria-label="Close form"><X size={20}/></button></div><form onSubmit={createOrder}><div className="modal-fields">
      <label className="field">PCC number <input required maxLength={40} placeholder="PCC-10490" value={form.pccNumber} onChange={(e) => setForm({ ...form, pccNumber: e.target.value })}/></label>
      <label className="field">Priority <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option>Standard</option><option>High</option></select></label>
      <label className="field">Retailer <input required placeholder="e.g. Hudson" value={form.retailer} onChange={(e) => setForm({ ...form, retailer: e.target.value })}/></label>
      <label className="field">Supplier <input required placeholder="e.g. Ingram Content Group" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}/></label>
      <label className="field">Destination store <input required placeholder="e.g. Hudson News T5" value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })}/></label>
      <label className="field">Store email <input type="email" placeholder="store@retailer.com" value={form.storeEmail} onChange={(e) => setForm({ ...form, storeEmail: e.target.value })}/></label>
      <label className="field">Terminal <select value={form.terminal} onChange={(e) => setForm({ ...form, terminal: e.target.value })}><option>Terminal 1</option><option>Terminal 4</option><option>Terminal 5</option><option>Terminal 7</option><option>Terminal 8</option></select></label>
      <label className="field">Category <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>Food & beverage</option><option>Beauty & fragrance</option><option>Books & magazines</option><option>Fashion & accessories</option><option>Toys & gifts</option><option>Electronics</option><option>Other</option></select></label>
      <label className="field">Cage type <select value={form.cageType} onChange={(e) => setForm({ ...form, cageType: e.target.value })}>{CAGE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label className="field">Temperature class <select value={form.temperatureClass} onChange={(e) => setForm({ ...form, temperatureClass: e.target.value })}>{TEMPERATURE_CLASSES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="field">Duty status <select value={form.dutyStatus} onChange={(e) => setForm({ ...form, dutyStatus: e.target.value })}>{DUTY_STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="field">Supplier docket <input placeholder="e.g. EL-88214" value={form.supplierDocket} onChange={(e) => setForm({ ...form, supplierDocket: e.target.value })}/></label>
      <label className="field">Total weight (kg) <input type="number" min="0" placeholder="0" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })}/></label>
      <label className="field">Expected store delivery <input required type="datetime-local" value={form.expectedDelivery} onChange={(e) => setForm({ ...form, expectedDelivery: e.target.value })}/></label>
      <div className="field full manifest-builder"><span className="manifest-label">Manifest lines</span>{lines.map((line, index) => <div className="manifest-row" key={index}><input required placeholder="SKU" value={line.sku} onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, sku: e.target.value } : item))}/><input required placeholder="Description" value={line.description} onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, description: e.target.value } : item))}/><input required type="number" min="1" placeholder="Units" value={line.unitsExpected} onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, unitsExpected: e.target.value } : item))}/><input type="number" min="0" placeholder="Cages" value={line.cages} onChange={(e) => setLines(lines.map((item, i) => i === index ? { ...item, cages: e.target.value } : item))}/>{lines.length > 1 && <button type="button" className="line-remove" onClick={() => setLines(lines.filter((_, i) => i !== index))}><Trash2 size={15}/></button>}</div>)}<button type="button" className="secondary-button" onClick={() => setLines([...lines, { sku: "", description: "", unitsExpected: "", cages: "" }])}><Plus size={15}/> Add line</button></div>
      <label className="field full">Handling notes <textarea rows={2} placeholder="Special handling instructions (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></label>
    </div>{formError && <p className="form-error">{formError}</p>}<div className="modal-footer"><button type="button" className="secondary-button" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Receiving..." : <><Plus size={17}/> Receive order</>}</button></div></form></div></div>}

    {toast && <div className="toast"><CheckCheck size={18}/>{toast}<button onClick={() => setToast("")}><X size={15}/></button></div>}
  </div>;
}

function StatCard({ label, value, note, icon: Icon, iconClass, trend, trendType, spark }: { label: string; value: number; note: string; icon: LucideIcon; iconClass: string; trend: string; trendType: string; spark?: string }) {
  return <div className="stat-card"><div className="stat-top"><div className={`stat-icon ${iconClass}`}><Icon size={21} strokeWidth={2}/></div><MoreHorizontal size={19} className="stat-dots"/></div><div className="stat-label">{label}</div><div className="stat-middle"><strong>{format(value)}</strong>{spark && <svg className={`sparkline ${iconClass}`} viewBox="0 0 96 34" aria-hidden="true"><polyline points={spark} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}</div><div className="stat-bottom"><span className={`trend ${trendType}`}>{trendType === "up" && <ArrowUpRight size={13}/>} {trend}</span><span>{note}</span></div></div>;
}
