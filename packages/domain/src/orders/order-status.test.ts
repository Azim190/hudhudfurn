import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  InvalidOrderTransitionError,
  isTerminal,
  ORDER_STATUSES,
} from './order-status';

describe('order state machine', () => {
  it('follows the made-to-measure happy path', () => {
    const path = ['NEW', 'PAID', 'IN_PRODUCTION', 'READY', 'INSTALLATION_SCHEDULED', 'DELIVERED', 'COMPLETED'] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('lets stock orders skip production', () => {
    expect(canTransition('PAID', 'READY')).toBe(true);
    expect(canTransition('READY', 'SHIPPED')).toBe(true);
  });

  it('forbids skipping payment or going backwards', () => {
    expect(canTransition('NEW', 'SHIPPED')).toBe(false);
    expect(canTransition('DELIVERED', 'PAID')).toBe(false);
  });

  it('forbids cancelling after dispatch', () => {
    expect(canTransition('SHIPPED', 'CANCELLED')).toBe(false);
    expect(canTransition('IN_PRODUCTION', 'CANCELLED')).toBe(true);
  });

  it('assertTransition throws a typed error', () => {
    expect(() => assertTransition('COMPLETED', 'NEW')).toThrow(InvalidOrderTransitionError);
    expect(() => assertTransition('NEW', 'PAID')).not.toThrow();
    try {
      assertTransition('CANCELLED', 'PAID');
    } catch (e) {
      expect((e as InvalidOrderTransitionError).from).toBe('CANCELLED');
      expect((e as InvalidOrderTransitionError).to).toBe('PAID');
    }
  });

  it('identifies terminal states', () => {
    expect(ORDER_STATUSES.filter(isTerminal)).toEqual(['COMPLETED', 'CANCELLED']);
    expect(allowedTransitions('COMPLETED')).toEqual([]);
  });
});
