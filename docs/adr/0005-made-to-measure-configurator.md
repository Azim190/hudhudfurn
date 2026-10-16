# ADR-0005: Made-to-measure configurator

- Status: Accepted
- Date: 2026-10-16

## Context
Custom curtains and blinds are the store's main differentiator. They are joined by tailored abayas and custom sofa and majlis covers. Prices depend on dimensions, fabric, heading fullness and add-ons. The rules change with suppliers and seasons, so the brief requires every formula and constant to be admin-configurable rather than hard-coded. The workshop also needs a complete, unambiguous cut specification for each order line.

## Decisions

**One pure engine, many templates.** `@hudhud/domain/configurator` holds the whole pricing logic (99% line coverage). A `ConfiguratorTemplate` (kind `CURTAIN | BLIND | ABAYA | SOFA_COVER`) carries:
- `constants`: hems, overlap, cut rounding, fabric width, dimension limits;
- `formulas`;
- heading styles: fullness min/default/max and making cost per metre of rail;
- options: group, code, price, and a price basis (`FLAT`, `PER_METER` of fabric, `PER_SQM`, `PER_PANEL`, `PER_WIDTH_M` of rail, `PER_PIECE`).

The API, the storefront's live price and the admin "simulate" panel all call the same `quoteConfiguration`.

**Formulas are data, never code.** A small parser and evaluator handles arithmetic, comparisons, `&&`/`||` with short-circuiting, and `ceil`, `floor`, `round`, `min`, `max`, `abs`, `roundUp(x, step)`, `if(c, a, b)`.
- Formulas are compiled against an allow-list of variables: the inputs plus the template constants plus earlier results.
- Their length and nesting depth are capped, and they can't reach any object, property or function outside that set.
- Invalid formulas are rejected when an admin saves them.

The default curtain formulas implement the brief:
- `widths = panels × max(1, ceil((width × fullness / panels + 2 × sideHem + overlap/2) / fabricWidth))`
- `cutLength = roundUp(height + bottomHem + headingAllowance + patternRepeat, cutRounding)`
- `fabricLength = widths × cutLength`, plus `railLength`

The ERD's separate `PricingRule` table became a `formulas` JSON field on the template. Formulas are always edited and versioned together with their template.

**Versioned rules, re-quoted carts, frozen orders.**
- Every admin change bumps the template version.
- A `SavedConfiguration` stores the customer's inputs.
- Carts re-price configured lines on every view, so fabric and option price changes reach them; a configuration that no longer quotes becomes a cart issue.
- At checkout the order line snapshots the template code, version, inputs, workshop specs, chosen options and price lines, so later edits never change a placed order.
- Configured lines are treated as made-to-order: no stock reservation and no cash on delivery.

**Validation produces issues, not exceptions.** Customer input outside the template limits returns structured issues (`field`, `code`, `params`), which the UI shows inline in cm or inches. The API refuses to add an invalid configuration to the cart (`configurationInvalid`).

**Customer photos are private.**
- Sofa photos are decoded and re-encoded with sharp: auto-rotated, metadata (including GPS) stripped, at most 2000 px.
- They go into a separate bucket (`S3_PRIVATE_BUCKET`) without public read access. Staff view them only through an authenticated admin endpoint.
- A photo can be attached to exactly one configuration, within 24 hours of upload. Photos never attached are purged hourly.

**Preview.** The storefront draws a simple SVG room: a window plus panels or a blind in the selected swatch colour, with folds by heading style. It is proportioned from the entered dimensions, which meets the brief's "simple overlay is acceptable for v1".

## Consequences
- **Tuning and new templates:** new heading styles, lining types or motor options need no deployment, and admins can try any change in the simulator before customers see it. New kinds (e.g. bedspreads) need an engine branch and tests in the domain package.
- **Measurement visits:** "Book a measurement visit" currently opens WhatsApp with the product pre-filled. It switches to the booking flow when the services module lands (Phase 6).
- **Job cards:** printable workshop job cards built from the order snapshots arrive with the workshop module (Phase 7).
