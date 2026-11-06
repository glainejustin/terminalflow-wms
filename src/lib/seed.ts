import { db } from "@/db";
import { orders, orderLines, orderEvents, operators, screeningRecords } from "@/db/schema";
import { hashPin } from "@/lib/pin";
import { eq } from "drizzle-orm";
import { demoOperatorsAllowed } from "@/lib/auth";

export const DEMO_OPERATORS = [
  { name: "Jordan Davis", role: "manager", pin: "1234" },
  { name: "Maya Chen", role: "receiver", pin: "2345" },
  { name: "Luis Ortega", role: "screener", pin: "3456" },
  { name: "Priya Nair", role: "dispatcher", pin: "4567" },
  { name: "Sam Reilly", role: "store_receiver", pin: "5678" },
];

const catalogue: Record<string, { sku: string; description: string; cages: number; units: number; cents: number }[]> = {
  "Food & beverage": [
    { sku: "CHF-PR-001", description: "Truffle Chocolate Bar 3-piece", cages: 4, units: 48, cents: 1850 },
    { sku: "BEV-COF-220", description: "Ground Coffee Beans 1kg", cages: 6, units: 24, cents: 3200 },
    { sku: "SNK-SEA-104", description: "Sea Salt Crackers 150g", cages: 8, units: 96, cents: 720 },
  ],
  "Beauty & fragrance": [
    { sku: "FRG-DIA-330", description: "Sauvage Eau de Parfum 100ml", cages: 2, units: 12, cents: 12900 },
    { sku: "SKN-LRD-210", description: "Hydrating Face Cream 60ml", cages: 3, units: 24, cents: 9800 },
    { sku: "FRG-CCH-118", description: "Chance Eau de Parfum 50ml", cages: 2, units: 12, cents: 11400 },
  ],
  "Books & magazines": [
    { sku: "BOK-NYT-501", description: "Airport Guide 2026 Edition", cages: 3, units: 60, cents: 1650 },
    { sku: "MAG-TIM-220", description: "Travel Magazine Quarterly", cages: 5, units: 150, cents: 890 },
    { sku: "BOK-FIC-777", description: "Bestseller Novel Paperback", cages: 4, units: 80, cents: 1450 },
  ],
  "Fashion & accessories": [
    { sku: "ACC-SUN-410", description: "Classic Aviator Sunglasses", cages: 2, units: 12, cents: 21500 },
    { sku: "BAG-TUM-220", description: "Business Class Travel Bag", cages: 1, units: 2, cents: 34000 },
    { sku: "ACC-WAT-118", description: "Automatic Travel Watch", cages: 2, units: 8, cents: 27500 },
  ],
  "Toys & gifts": [
    { sku: "TYL-LEG-330", description: "Architecture Building Set", cages: 4, units: 48, cents: 5900 },
    { sku: "GFT-CHC-220", description: "Premium Gift Chocolates", cages: 5, units: 60, cents: 2450 },
    { sku: "PLU-SQU-540", description: "Plush Character Toy", cages: 4, units: 40, cents: 3200 },
  ],
};

const cageTypeByCategory: Record<string, string> = {
  "Food & beverage": "Roll cage",
  "Beauty & fragrance": "Security cage",
  "Books & magazines": "Roll cage",
  "Fashion & accessories": "Security cage",
  "Toys & gifts": "Half cage",
};

const seedOrders = [
  { pccNumber: "PCC-10482", retailer: "World Duty Free", store: "World Duty Free T4", terminal: "Terminal 4", supplier: "Estée Lauder Companies", category: "Beauty & fragrance", status: "Awaiting screening", screening: "Pending", priority: "High", storageZone: "Receiving bay", hours: 3, docket: "EL-88214", duty: "Bonded", weight: 640 },
  { pccNumber: "PCC-10481", retailer: "Hudson", store: "Hudson News T5", terminal: "Terminal 5", supplier: "Ingram Content Group", category: "Books & magazines", status: "Screening", screening: "In progress", priority: "Standard", storageZone: "Screening lane 2", hours: 4, docket: "IG-55190", duty: "Duty paid", weight: 480 },
  { pccNumber: "PCC-10480", retailer: "Starbucks", store: "Starbucks T4 Arrivals", terminal: "Terminal 4", supplier: "Nestlé Professional", category: "Food & beverage", status: "In storage", screening: "Cleared", priority: "Standard", storageZone: "Ambient A-03", hours: 6, docket: "NP-71033", duty: "Duty paid", weight: 1120 },
  { pccNumber: "PCC-10479", retailer: "WHSmith", store: "WHSmith T8 Departures", terminal: "Terminal 8", supplier: "HarperCollins", category: "Books & magazines", status: "Ready for dispatch", screening: "Cleared", priority: "High", storageZone: "Dispatch bay 1", hours: 2, docket: "HC-40218", duty: "Duty paid", weight: 390 },
  { pccNumber: "PCC-10478", retailer: "TUMI", store: "TUMI T4", terminal: "Terminal 4", supplier: "Samsonite International", category: "Fashion & accessories", status: "In transit", screening: "Cleared", priority: "High", storageZone: "With airport transport", hours: 0, docket: "SI-30776", duty: "Duty paid", weight: 210, seal: "SL-77419" },
  { pccNumber: "PCC-10477", retailer: "Sunglass Hut", store: "Sunglass Hut T5", terminal: "Terminal 5", supplier: "Luxottica", category: "Fashion & accessories", status: "Delivered", screening: "Cleared", priority: "Standard", storageZone: "Store delivered", hours: -2, docket: "LX-61245", duty: "Duty paid", weight: 160, seal: "SL-77380" },
  { pccNumber: "PCC-10476", retailer: "LEGO Store", store: "LEGO Store T4", terminal: "Terminal 4", supplier: "LEGO Group", category: "Toys & gifts", status: "Cleared", screening: "Cleared", priority: "Standard", storageZone: "Screening exit", hours: 8, docket: "LG-12908", duty: "Duty paid", weight: 720 },
  { pccNumber: "PCC-10475", retailer: "Hudson", store: "Hudson News T8", terminal: "Terminal 8", supplier: "PepsiCo", category: "Food & beverage", status: "Awaiting screening", screening: "Pending", priority: "Standard", storageZone: "Receiving bay", hours: 5, docket: "PC-90112", duty: "Duty paid", weight: 1480 },
  { pccNumber: "PCC-10474", retailer: "Jo Malone London", store: "Jo Malone T4", terminal: "Terminal 4", supplier: "Estée Lauder Companies", category: "Beauty & fragrance", status: "In storage", screening: "Cleared", priority: "High", storageZone: "Secure S-02", hours: 7, docket: "EL-88190", duty: "Bonded", weight: 240, seal: "SL-77312" },
  { pccNumber: "PCC-10473", retailer: "Relay", store: "Relay T7", terminal: "Terminal 7", supplier: "Mondelez International", category: "Food & beverage", status: "Ready for dispatch", screening: "Cleared", priority: "Standard", storageZone: "Dispatch bay 2", hours: 3, docket: "MI-44327", duty: "Duty paid", weight: 860 },
  { pccNumber: "PCC-10472", retailer: "World Duty Free", store: "World Duty Free T8", terminal: "Terminal 8", supplier: "L'Oréal Travel Retail", category: "Beauty & fragrance", status: "Delivered", screening: "Cleared", priority: "Standard", storageZone: "Store delivered", hours: -3, docket: "LO-20551", duty: "Bonded", weight: 510, seal: "SL-77288" },
  { pccNumber: "PCC-10471", retailer: "Hudson", store: "Hudson News T4", terminal: "Terminal 4", supplier: "The Hershey Company", category: "Food & beverage", status: "Received", screening: "Pending", priority: "High", storageZone: "Receiving bay", hours: 9, docket: "HS-77410", duty: "Duty paid", weight: 990 },
];

export async function ensureSeeded() {
  const existing = await db.select({ id: operators.id, isDemo: operators.isDemo }).from(operators);
  const hasCompanyOperator = existing.some((record) => !record.isDemo);
  const bootstrapName = process.env.BOOTSTRAP_OPERATOR_NAME?.trim();
  const bootstrapPin = process.env.BOOTSTRAP_OPERATOR_PIN;
  if (!hasCompanyOperator && (bootstrapName || bootstrapPin)) {
    if (!bootstrapName || !bootstrapPin || bootstrapPin.length < 8) {
      throw new Error("Set both BOOTSTRAP_OPERATOR_NAME and BOOTSTRAP_OPERATOR_PIN (at least 8 characters).");
    }
    await db.insert(operators).values({ name: bootstrapName.slice(0, 80), role: "manager", pinHash: hashPin(bootstrapPin), isDemo: false });
  } else if (!existing.length && demoOperatorsAllowed()) {
    await db.insert(operators).values(DEMO_OPERATORS.map((member) => ({ name: member.name, role: member.role, pinHash: hashPin(member.pin), isDemo: true })));
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_DATA !== "true" && !process.env.E2B_SANDBOX_ID) return;
  const existingOrders = await db.select({ id: orders.id }).from(orders).limit(1);
  if (existingOrders.length) return;
  const now = Date.now();
  const roster = await db.select().from(operators);
  const byRole = (role: string) => roster.find((member) => member.role === role)?.name ?? "Jordan Davis";
  const created = await db.insert(orders).values(seedOrders.map((order, index) => ({
    pccNumber: order.pccNumber,
    retailer: order.retailer,
    store: order.store,
    storeEmail: `ops@${order.retailer.toLowerCase().replace(/[^a-z]+/g, "")}.example`,
    terminal: order.terminal,
    supplier: order.supplier,
    category: order.category,
    cageType: cageTypeByCategory[order.category] ?? "Roll cage",
    temperatureClass: "Ambient",
    weightKg: order.weight,
    supplierDocket: order.docket,
    dutyStatus: order.duty,
    sealNumber: order.seal ?? "",
    status: order.status,
    screening: order.screening,
    priority: order.priority,
    storageZone: order.storageZone,
    expectedDelivery: new Date(now + order.hours * 3600000),
    receivedAt: new Date(now - (index + 1) * 18 * 60000),
    dispatchedAt: ["In transit", "Delivered"].includes(order.status) ? new Date(now - 3 * 3600000) : null,
    deliveredAt: order.status === "Delivered" ? new Date(now - 2 * 3600000) : null,
    notes: index === 3 ? "Priority replenishment for the evening departures bank." : "",
    createdBy: byRole("receiver"),
    updatedBy: byRole("manager"),
  }))).returning();

  for (const order of created) {
    const template = catalogue[order.category] ?? catalogue["Food & beverage"];
    const lines = template.map((line, index) => ({
      orderId: order.id,
      sku: line.sku,
      barcode: `50${String(line.cents)}${index}${line.sku.slice(-3)}`,
      description: line.description,
      category: order.category,
      cages: line.cages,
      unitsExpected: line.units,
      unitsReceived: line.units,
      unitValueCents: line.cents,
      receivedBy: byRole("receiver"),
      receivedAt: new Date(new Date(order.receivedAt).getTime() + 25 * 60000),
    }));
    await db.insert(orderLines).values(lines);
    await db.update(orders).set({ cages: lines.reduce((n, l) => n + l.cages, 0), units: lines.reduce((n, l) => n + l.unitsExpected, 0) }).where(eq(orders.id, order.id));
  }

  const screeningOrder = created.find((order) => order.pccNumber === "PCC-10480");
  if (screeningOrder) {
    await db.insert(screeningRecords).values({
      orderId: screeningOrder.id,
      method: "X-ray inspection",
      result: "cleared",
      screenerName: byRole("screener"),
      reference: "XR-4471",
      notes: "All cages passed X-ray without anomaly.",
      createdAt: new Date(now - 4 * 3600000),
    });
  }
  const heldOrder = created.find((order) => order.pccNumber === "PCC-10481");
  if (heldOrder) {
    await db.insert(screeningRecords).values({
      orderId: heldOrder.id,
      method: "Physical inspection",
      result: "referred",
      screenerName: byRole("screener"),
      reference: "PH-1183",
      notes: "One cage selected for physical inspection.",
      quarantineReason: "Explosive trace follow-up",
      createdAt: new Date(now - 55 * 60000),
    });
  }
  await db.insert(orderEvents).values([
    { orderId: created[10]?.id ?? null, title: "Order received at center", detail: `${created[10]?.pccNumber} · ${created[10]?.retailer}`, kind: "info", actor: byRole("receiver"), actorRole: "receiver", createdAt: new Date(now - 12 * 60000) },
    { orderId: screeningOrder?.id ?? null, title: "Screening cleared", detail: `${screeningOrder?.pccNumber} · XR-4471`, kind: "success", actor: byRole("screener"), actorRole: "screener", createdAt: new Date(now - 4 * 3600000) },
    { orderId: heldOrder?.id ?? null, title: "Physical inspection required", detail: `${heldOrder?.pccNumber} · Explosive trace follow-up`, kind: "warning", actor: byRole("screener"), actorRole: "screener", createdAt: new Date(now - 55 * 60000) },
    { orderId: created[5]?.id ?? null, title: "Store delivery confirmed", detail: `${created[5]?.pccNumber} · ${created[5]?.store}`, kind: "success", actor: byRole("store_receiver"), actorRole: "store_receiver", createdAt: new Date(now - 2 * 3600000) },
    { orderId: created[7]?.id ?? null, title: "Order queued for screening", detail: `${created[7]?.pccNumber} · ${created[7]?.store}`, kind: "info", actor: byRole("receiver"), actorRole: "receiver", createdAt: new Date(now - 40 * 60000) },
  ]);
}
