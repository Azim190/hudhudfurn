# ADR-0006: Home measurement and installation visits, technician flow, quotations

- Status: Accepted
- Date: 2026-10-16

## Context
Most made-to-measure curtain sales start with a home visit. A technician measures every window, shows fabrics and leaves a price. The brief asks for:
- online booking by area and time slot;
- admin control of areas, capacity, technicians and fees;
- a technician job flow with navigation, contact, measurements, photos and the customer's signature;
- quotations the customer approves and pays online;
- status messages in the customer's language.

All of this has to reuse the payments, VAT invoices and refunds built in Phase 4 rather than inventing a second money path.

## Decisions

**Slots are rows with a counter.** A `TimeSlot` row has `capacity` and `booked` for one area, date and time window, and is generated in bulk from weekly templates (`generateSlots`, with existing slots skipped).
- Booking reserves a place with a single conditional `UPDATE … SET booked = booked + 1 WHERE booked < capacity AND is_active`, so concurrent bookings can never overbook. A CHECK constraint (`0 ≤ booked ≤ capacity`) backs this up.
- Cancelling, rescheduling or an expired fee payment releases the place in the same transaction as the status change.
- Booking is idempotent (`Idempotency-Key`), like checkout.

**Visit fees and accepted quotations are ordinary orders.** `ServiceOrderWriter` creates an order with:
- service or configured lines;
- the visit credit spread across the lines;
- delivery by our own fleet with method `INSTALLATION`;
- a payment session from the existing payment port.

Card, Tabby/Tamara, the simulator, re-verification, webhooks, the payment-expiry job, ZATCA invoices, credit notes and refunds therefore all apply unchanged. `OrdersService` gained `onPaid` and `onCancelled` listeners:
- the services module confirms a booking when its fee order is paid;
- it cancels the booking and releases the slot when the fee order is cancelled or expires;
- it reopens an accepted quotation if its order fails.

**One booking state machine** lives in `@hudhud/domain/services` and is unit-tested at 100% coverage: REQUESTED → CONFIRMED → ASSIGNED → EN_ROUTE → IN_PROGRESS → COMPLETED, with CANCELLED and NO_SHOW. Every transition is checked there and recorded as a `BookingEvent`.
- The rule for when a customer may still change a visit (`customerCanChange`) is in the domain package too.
- So are fee selection (`bookingFee`, including free installation above an order total), phone masking, navigation links and quotation totals.

**Quotations reuse the configurator.** A technician picks a product, fabric, heading and options for each measured window.
- The measured width, height and mounting override any typed input, and the mounting is mapped onto the template's codes.
- Each line is priced by `ConfiguratorService.create`, so it is saved as a normal `SavedConfiguration` with workshop specs.
- Accepting the quotation copies those snapshots onto the order lines, so production sees exactly what a configured web order would show.
- Prices are fixed when the quotation is sent. It expires after `quotationValidityDays`, and a new quotation cancels the previous open one.
- A measurement fee paid within `visitCreditDays` is credited, but never below zero.

**Technicians use the admin web app for now.** A technician is a staff user with the Technician role (`services.technician`) and a `TechnicianProfile` (phone, areas, active flag). The `/technician` API only returns visits assigned to the caller.
- The admin app has phone-sized screens: a daily list, then the job screen with status buttons, a camera upload, a canvas signature pad and the quotation builder. Staff whose only permission is `services.technician` land there directly.
- The customer's number is masked until the visit day. Photos and the signature are private uploads, readable only through permission-checked admin routes.
- The Flutter technician app (Phase 9) will call the same API.

**Notifications go through the existing SMS port**, using `translate(locale, 'sms.<key>')` with the language the customer booked in. Messages are sent for confirmation, technician assignment, the technician setting off, cancellation and a new quotation with its link.
- WhatsApp and push channels arrive with the notification module (Phase 8).
- In development, the console provider also keeps the last messages per number in Redis for 15 minutes, at `GET /dev/sms?to=`. End-to-end tests use this to read OTP codes and links. The endpoint returns 404 unless the console provider is active outside production.

## Consequences
- Booking, payment and refunds share one audited money path. Finance sees visit fees and installation orders in the same invoice chain and reports.
- Capacity is per area and window, not per technician. The office assigns technicians after booking, so per-technician calendars and route optimisation are not modelled.
- Installation visits are booked from a paid made-to-measure order with an installation option. Their fee follows the area rules and the order total.
- The services module owns no payment code. Any new payment method automatically works for visits and quotations.
