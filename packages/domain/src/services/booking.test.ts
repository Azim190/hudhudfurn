import { describe, expect, it } from 'vitest';
import { bookingFee, canTransitionBooking, customerCanChange, generateSlots, mountingChoice, navigationUrl, quotationTotals, slotStartsAt, technicianPhone } from './booking';

describe('booking lifecycle', () => {
  it('allows the field workflow and blocks going back', () => {
    expect(canTransitionBooking('REQUESTED', 'CONFIRMED')).toBe(true);
    expect(canTransitionBooking('CONFIRMED', 'ASSIGNED')).toBe(true);
    expect(canTransitionBooking('ASSIGNED', 'ASSIGNED')).toBe(true); // reassign
    expect(canTransitionBooking('ASSIGNED', 'EN_ROUTE')).toBe(true);
    expect(canTransitionBooking('EN_ROUTE', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionBooking('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canTransitionBooking('EN_ROUTE', 'CANCELLED')).toBe(false);
    expect(canTransitionBooking('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionBooking('REQUESTED', 'ASSIGNED')).toBe(false);
  });

  it('lets customers change a visit only before the cut-off and before the technician leaves', () => {
    const start = new Date('2026-10-20T09:00:00+03:00');
    expect(customerCanChange('CONFIRMED', start, new Date('2026-10-19T08:00:00+03:00'), 24)).toBe(true);
    expect(customerCanChange('CONFIRMED', start, new Date('2026-10-19T10:00:00+03:00'), 24)).toBe(false);
    expect(customerCanChange('EN_ROUTE', start, new Date('2026-10-01T00:00:00+03:00'), 24)).toBe(false);
  });
});

describe('bookingFee', () => {
  const rules = { measurementFee: 5000, installationFee: 15000, freeInstallationAbove: 150000 };
  it('charges measurement visits and waives installation when it is included or the order is large', () => {
    expect(bookingFee(rules, { type: 'MEASUREMENT' })).toBe(5000);
    expect(bookingFee(rules, { type: 'INSTALLATION', orderTotal: 90000 })).toBe(15000);
    expect(bookingFee(rules, { type: 'INSTALLATION', orderTotal: 150000 })).toBe(0);
    expect(bookingFee(rules, { type: 'INSTALLATION', orderTotal: 1000, orderIncludesInstallation: true })).toBe(0);
    expect(bookingFee({ ...rules, freeInstallationAbove: null }, { type: 'INSTALLATION', orderTotal: 999999 })).toBe(15000);
    expect(bookingFee(rules, { type: 'INSTALLATION' })).toBe(15000);
  });
});

describe('technician helpers', () => {
  it('masks the customer phone until the visit day', () => {
    expect(technicianPhone('+966551234567', { status: 'ASSIGNED', visitDate: '2026-10-20', today: '2026-10-19' })).toEqual({ phone: '+96655•••••67', masked: true });
    expect(technicianPhone('+966551234567', { status: 'ASSIGNED', visitDate: '2026-10-20', today: '2026-10-20' })).toEqual({ phone: '+966551234567', masked: false });
    expect(technicianPhone('+966551234567', { status: 'EN_ROUTE', visitDate: '2026-10-21', today: '2026-10-20' }).masked).toBe(false);
    expect(technicianPhone('+96655', { status: 'CONFIRMED', visitDate: 'x', today: 'y' }).phone).toBe('+9665555');
  });

  it('builds navigation links from coordinates or the address', () => {
    expect(navigationUrl({ lat: 24.7, lng: 46.68, text: 'x' })).toBe('https://www.google.com/maps/dir/?api=1&destination=24.7,46.68');
    expect(navigationUrl({ lat: null, lng: null, text: 'Olaya St, Riyadh' })).toBe('https://www.google.com/maps/search/?api=1&query=Olaya%20St%2C%20Riyadh');
  });
});

describe('generateSlots', () => {
  const template = { weekdays: [0, 1, 2, 3, 4], windows: [{ start: '09:00', end: '12:00' }, { start: '16:00', end: '20:00' }], capacity: 3 };

  it('expands a weekly template, skipping Friday and Saturday', () => {
    // 2026-10-16 is a Friday, 10-18 a Sunday.
    const slots = generateSlots(template, '2026-10-16', '2026-10-18');
    expect(slots.map((s) => `${s.date} ${s.start}`)).toEqual(['2026-10-18 09:00', '2026-10-18 16:00']);
    expect(slots[0]).toMatchObject({ end: '12:00', capacity: 3 });
  });

  it('rejects bad windows, capacities and ranges', () => {
    expect(() => generateSlots({ ...template, windows: [{ start: '12:00', end: '09:00' }] }, '2026-10-18', '2026-10-18')).toThrow(/Invalid window/);
    expect(() => generateSlots({ ...template, windows: [{ start: '9:00', end: '12:00' }] }, '2026-10-18', '2026-10-18')).toThrow(/Invalid window/);
    expect(() => generateSlots({ ...template, capacity: 0 }, '2026-10-18', '2026-10-18')).toThrow(/capacity/);
    expect(() => generateSlots(template, '2026-10-18', '2026-10-17')).toThrow(/range/);
    expect(() => generateSlots(template, '2026-01-01', '2026-12-31')).toThrow(/range/);
  });

  it('places slots in Riyadh time', () => {
    expect(slotStartsAt('2026-10-18', '09:00').toISOString()).toBe('2026-10-18T06:00:00.000Z');
  });
});

describe('quotationTotals', () => {
  it('credits the visit fee without going below zero', () => {
    expect(quotationTotals([{ unitPrice: 100000, quantity: 2 }, { unitPrice: 25000, quantity: 1 }], 5000)).toEqual({ subtotal: 225000, credit: 5000, total: 220000 });
    expect(quotationTotals([{ unitPrice: 3000, quantity: 1 }], 5000)).toEqual({ subtotal: 3000, credit: 3000, total: 0 });
    expect(quotationTotals([{ unitPrice: 3000, quantity: 1 }], -10)).toEqual({ subtotal: 3000, credit: 0, total: 3000 });
  });
});

describe('mountingChoice', () => {
  it('maps measured mountings onto curtain and blind option codes', () => {
    const curtain = ['WALL', 'CEILING', 'RECESS'];
    const blind = ['INSIDE', 'OUTSIDE'];
    expect(mountingChoice('CEILING', curtain)).toBe('CEILING');
    expect(mountingChoice('RECESS', blind)).toBe('INSIDE');
    expect(mountingChoice('WALL', blind)).toBe('OUTSIDE');
    expect(mountingChoice('RECESS', [])).toBeUndefined();
  });
});
