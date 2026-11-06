import { pgTable, uuid, varchar, integer, timestamp, text, boolean, index } from "drizzle-orm/pg-core";

export const operators = pgTable("operators", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 80 }).notNull(),
  role: varchar("role", { length: 24 }).notNull(),
  pinHash: varchar("pin_hash", { length: 200 }).notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("retailer_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  pccNumber: varchar("pcc_number", { length: 40 }).notNull().unique(),
  retailer: varchar("retailer", { length: 120 }).notNull(),
  store: varchar("store", { length: 120 }).notNull(),
  storeEmail: varchar("store_email", { length: 160 }).notNull().default(""),
  terminal: varchar("terminal", { length: 40 }).notNull(),
  supplier: varchar("supplier", { length: 120 }).notNull(),
  category: varchar("category", { length: 60 }).notNull(),
  cages: integer("cages").notNull().default(0),
  cageType: varchar("cage_type", { length: 32 }).notNull().default("Roll cage"),
  temperatureClass: varchar("temperature_class", { length: 24 }).notNull().default("Ambient"),
  weightKg: integer("weight_kg").notNull().default(0),
  supplierDocket: varchar("supplier_docket", { length: 80 }).notNull().default(""),
  dutyStatus: varchar("duty_status", { length: 24 }).notNull().default("Duty paid"),
  sealNumber: varchar("seal_number", { length: 40 }).notNull().default(""),
  units: integer("units").notNull().default(0),
  status: varchar("status", { length: 32 }).notNull().default("Received"),
  screening: varchar("screening", { length: 24 }).notNull().default("Pending"),
  priority: varchar("priority", { length: 16 }).notNull().default("Standard"),
  storageZone: varchar("storage_zone", { length: 40 }).notNull().default("Receiving bay"),
  expectedDelivery: timestamp("expected_delivery", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  notes: text("notes").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdBy: varchar("created_by", { length: 80 }).notNull().default("system"),
  updatedBy: varchar("updated_by", { length: 80 }).notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("orders_status_idx").on(table.status), index("orders_received_idx").on(table.receivedAt)]);

export const orderLines = pgTable("order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  sku: varchar("sku", { length: 64 }).notNull(),
  barcode: varchar("barcode", { length: 64 }).notNull().default(""),
  description: varchar("description", { length: 160 }).notNull(),
  category: varchar("category", { length: 60 }).notNull().default(""),
  cages: integer("cages").notNull().default(0),
  unitsExpected: integer("units_expected").notNull(),
  unitsReceived: integer("units_received").notNull().default(0),
  unitsDamaged: integer("units_damaged").notNull().default(0),
  unitValueCents: integer("unit_value_cents").notNull().default(0),
  varianceReason: varchar("variance_reason", { length: 120 }).notNull().default(""),
  receivedBy: varchar("received_by", { length: 80 }).notNull().default(""),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("order_lines_order_idx").on(table.orderId)]);

export const screeningRecords = pgTable("screening_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  method: varchar("method", { length: 48 }).notNull(),
  result: varchar("result", { length: 24 }).notNull(),
  screenerName: varchar("screener_name", { length: 80 }).notNull(),
  reference: varchar("reference", { length: 80 }).notNull().default(""),
  notes: text("notes").notNull().default(""),
  quarantineReason: varchar("quarantine_reason", { length: 120 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("screening_order_idx").on(table.orderId)]);

export const orderEvents = pgTable("order_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  detail: varchar("detail", { length: 240 }).notNull().default(""),
  kind: varchar("kind", { length: 24 }).notNull().default("info"),
  actor: varchar("actor", { length: 80 }).notNull().default("system"),
  actorRole: varchar("actor_role", { length: 24 }).notNull().default("system"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("events_order_idx").on(table.orderId)]);

export const mailMessages = pgTable("mail_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  internetMessageId: varchar("internet_message_id", { length: 200 }).notNull().unique(),
  fromAddress: varchar("from_address", { length: 160 }).notNull().default(""),
  subject: varchar("subject", { length: 240 }).notNull().default(""),
  bodyPreview: text("body_preview").notNull().default(""),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("new"),
  importedPccNumber: varchar("imported_pcc_number", { length: 40 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
