/**
 * Order lifecycle state machine:
 * new → paid → in production → ready → shipped / installation scheduled → delivered → completed.
 * Orders that need no production (stock items) may go straight from PAID to READY.
 */
export const ORDER_STATUSES = [
  'NEW',
  'PAID',
  'IN_PRODUCTION',
  'READY',
  'SHIPPED',
  'INSTALLATION_SCHEDULED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ['PAID', 'CANCELLED'],
  PAID: ['IN_PRODUCTION', 'READY', 'CANCELLED'],
  IN_PRODUCTION: ['READY', 'CANCELLED'],
  READY: ['SHIPPED', 'INSTALLATION_SCHEDULED', 'DELIVERED'],
  SHIPPED: ['DELIVERED'],
  INSTALLATION_SCHEDULED: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidOrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Order cannot move from ${from} to ${to}`);
    this.name = 'InvalidOrderTransitionError';
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw new InvalidOrderTransitionError(from, to);
}

export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
