export type Operator = { id: string; name: string; role: string };

export type OrderLine = {
  id: string;
  orderId: string;
  sku: string;
  barcode: string;
  description: string;
  category: string;
  cages: number;
  unitsExpected: number;
  unitsReceived: number;
  unitsDamaged: number;
  unitValueCents: number;
  varianceReason: string;
  receivedBy: string;
  receivedAt: string | null;
};

export type ScreeningRecord = {
  id: string;
  orderId: string;
  method: string;
  result: string;
  screenerName: string;
  reference: string;
  notes: string;
  quarantineReason: string;
  createdAt: string;
};

export type OrderEvent = {
  id: string;
  orderId: string | null;
  title: string;
  detail: string;
  kind: string;
  actor: string;
  actorRole: string;
  note: string;
  createdAt: string;
};

export type Order = {
  id: string;
  pccNumber: string;
  retailer: string;
  store: string;
  storeEmail: string;
  terminal: string;
  supplier: string;
  category: string;
  cages: number;
  cageType: string;
  temperatureClass: string;
  weightKg: number;
  supplierDocket: string;
  dutyStatus: string;
  sealNumber: string;
  units: number;
  status: string;
  screening: string;
  priority: string;
  storageZone: string;
  expectedDelivery: string;
  receivedAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  notes: string;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  lines?: OrderLine[];
};

export type MailMessage = {
  id: string;
  internetMessageId: string;
  fromAddress: string;
  subject: string;
  bodyPreview: string;
  receivedAt: string;
  status: string;
  importedPccNumber: string;
};

export type Stats = {
  atCenter: number;
  toScreen: number;
  stored: number;
  dispatchReady: number;
  inTransit: number;
  delivered: number;
  totalUnits: number;
  cages: number;
  valueCents: number;
  varianceLines: number;
  varianceUnits: number;
  onTime: number | null;
  screening: { cleared: number; referred: number; failed: number };
  byStatus: Record<string, number>;
};
