export const STATUSES = [
  "Received",
  "Awaiting screening",
  "Screening",
  "Cleared",
  "In storage",
  "Ready for dispatch",
  "In transit",
  "Delivered",
  "On hold",
] as const;

export type OrderStatus = (typeof STATUSES)[number];

export const SCREENING_RESULTS = ["Pending", "In progress", "Cleared", "Failed"] as const;
export const SCREENING_METHODS = ["X-ray inspection", "Physical inspection", "Document check", "Explosive trace"] as const;
export const CAGE_TYPES = ["Roll cage", "Half cage", "Security cage", "Pallet", "Birdcage"] as const;
export const TEMPERATURE_CLASSES = ["Ambient", "Chilled", "Frozen"] as const;
export const DUTY_STATUSES = ["Duty paid", "Bonded", "Duty free"] as const;
export const VARIANCE_REASONS = [
  "Short shipment",
  "Over shipment",
  "Damaged in transit",
  "Seal broken",
  "Expired product",
  "Wrong article",
  "Packaging compromised",
] as const;

export const ROLES = {
  manager: "Center Manager",
  receiver: "Goods Receiver",
  screener: "Security Screener",
  dispatcher: "Dispatcher",
  store_receiver: "Store Receiver",
} as const;

export type RoleKey = keyof typeof ROLES;

/** Deterministic stage machine. Every transition is a human decision recorded against an operator. */
export const TRANSITIONS: Record<string, string[]> = {
  Received: ["Awaiting screening"],
  "Awaiting screening": ["Screening"],
  Screening: ["Cleared", "On hold"],
  "On hold": ["Awaiting screening"],
  Cleared: ["In storage", "Ready for dispatch"],
  "In storage": ["Ready for dispatch"],
  "Ready for dispatch": ["In transit"],
  "In transit": ["Delivered"],
  Delivered: [],
};

/** Which role may authorise each transition. The manager may authorise any stage. */
export const TRANSITION_ROLES: Record<string, RoleKey[]> = {
  "Awaiting screening": ["receiver", "screener", "manager"],
  Screening: ["screener", "manager"],
  Cleared: ["screener", "manager"],
  "On hold": ["screener", "manager"],
  "In storage": ["receiver", "dispatcher", "manager"],
  "Ready for dispatch": ["dispatcher", "manager"],
  "In transit": ["dispatcher", "manager"],
  Delivered: ["store_receiver", "dispatcher", "manager"],
};

export const ACTION_LABELS: Record<string, string> = {
  "Awaiting screening": "Queue for screening",
  Screening: "Start screening",
  Cleared: "Clear screening",
  "On hold": "Place on security hold",
  "In storage": "Move into warehouse storage",
  "Ready for dispatch": "Release for airport dispatch",
  "In transit": "Dispatch to airport",
  Delivered: "Confirm store delivery",
};

export function canTransition(from: string, to: string) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function roleCanTransition(role: string, to: string) {
  if (role === "manager") return true;
  return (TRANSITION_ROLES[to] ?? []).includes(role as RoleKey);
}

export function allowedActions(status: string, role: string) {
  return (TRANSITIONS[status] ?? [])
    .filter((next) => roleCanTransition(role, next))
    .map((next) => ({ status: next, label: ACTION_LABELS[next] ?? next }));
}
