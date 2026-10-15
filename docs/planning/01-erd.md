# Entity-Relationship Design

Conventions used across all tables:

- Primary keys are `uuid` (v7, time-ordered) named `id`.
- Every table has `created_at` / `updated_at` (`timestamptz`); soft-deletable aggregates add `deleted_at`.
- **Bilingual text** is stored as two columns, `*_ar` / `*_en`, for every localized field, including descriptions and care text (see ADR-0003; this replaces the earlier `jsonb` plan for long-form text). Arabic is mandatory; English is optional, and the admin UI shows completeness.
- Money is `integer` **halalas** (1 SAR = 100 halalas) to avoid floating-point errors. Measurements are `integer` millimetres. Fabric quantities are `integer` centimetres.
- Configurable business values (fullness ratios, hems, VAT rate, return windows) live in data, never in code.

The diagrams are split by bounded context. Entities shared between contexts are shown in every context that uses them.

---

## 1. Identity, Access & Audit

```mermaid
erDiagram
    User ||--o{ UserRole : has
    Role ||--o{ UserRole : grants
    Role ||--o{ RolePermission : contains
    Permission ||--o{ RolePermission : in
    User ||--o{ Session : opens
    User ||--o| TotpSecret : "2FA (admins)"
    User ||--o{ Address : saves
    User ||--o{ ConsentRecord : gives
    User ||--o{ DataSubjectRequest : files
    User ||--o{ AuditLog : performs
    OtpChallenge }o--|| User : "verifies (optional)"

    User {
        uuid id PK
        string phone_e164 UK "Saudi +9665XXXXXXXX"
        string email UK "nullable"
        string password_hash "staff only, argon2id"
        string full_name
        enum kind "CUSTOMER | STAFF"
        enum locale "ar | en"
        enum digits "western | arabic_indic"
        enum calendar "gregory | islamic_umalqura"
        enum status "ACTIVE | BLOCKED | DELETED"
        timestamptz last_login_at
    }
    Role {
        uuid id PK
        string key UK "owner, admin, store_manager, ..."
        string name_ar
        string name_en
        bool is_system
    }
    Permission {
        string key PK "e.g. catalog.product.write"
        string group
    }
    Session {
        uuid id PK
        uuid user_id FK
        string refresh_token_hash
        uuid family_id "rotation family; reuse => revoke family"
        string ip
        string user_agent
        string device_label
        timestamptz expires_at
        timestamptz revoked_at
    }
    TotpSecret {
        uuid user_id PK
        bytes secret_encrypted "AES-256-GCM"
        timestamptz confirmed_at
        jsonb recovery_codes_hashed
    }
    OtpChallenge {
        uuid id PK
        string phone_e164
        string code_hash
        enum purpose "LOGIN | VERIFY_PHONE"
        int attempts
        timestamptz expires_at
        timestamptz consumed_at
    }
    Address {
        uuid id PK
        uuid user_id FK
        string label
        string recipient_name
        string phone_e164
        uuid city_id FK
        uuid district_id FK
        string street
        string building_no
        string additional_no
        string postal_code
        string short_address "National Address e.g. RRRD2929"
        decimal lat
        decimal lng
        bool is_default
    }
    ConsentRecord {
        uuid id PK
        uuid user_id FK
        enum purpose "MARKETING_SMS | MARKETING_WA | ANALYTICS | ..."
        bool granted
        string policy_version
        timestamptz recorded_at
    }
    DataSubjectRequest {
        uuid id PK
        uuid user_id FK
        enum type "EXPORT | DELETE | RECTIFY"
        enum status "PENDING | PROCESSING | DONE | REJECTED"
        string result_url
    }
    AuditLog {
        uuid id PK
        uuid actor_id FK
        string action "e.g. product.update"
        string entity_type
        uuid entity_id
        jsonb before
        jsonb after
        string ip
        timestamptz at
    }
```

## 2. Catalog

```mermaid
erDiagram
    Category ||--o{ Category : "parent of"
    Category ||--o{ Product : classifies
    Category ||--o{ CategoryAttribute : "defines facets"
    Attribute ||--o{ CategoryAttribute : "used by"
    Attribute ||--o{ AttributeValue : "has values"
    Brand ||--o{ Product : makes
    Product ||--o{ ProductVariant : "has"
    Product ||--o{ ProductAttributeValue : "described by"
    AttributeValue ||--o{ ProductAttributeValue : ""
    ProductVariant ||--o{ VariantOptionValue : "defined by"
    AttributeValue ||--o{ VariantOptionValue : ""
    Product ||--o{ ProductMedia : shows
    ProductVariant ||--o{ ProductMedia : "variant images"
    MediaAsset ||--o{ ProductMedia : ""
    Product }o--o| SizeGuide : uses
    Product }o--o| ConfiguratorTemplate : "made-to-measure via"
    Product }o--o| ReturnPolicy : "overrides category policy"
    Category }o--o| ReturnPolicy : "default policy"
    Collection ||--o{ CollectionProduct : includes
    Product ||--o{ CollectionProduct : ""
    Product ||--o{ ProductRelation : "cross-sell / complete-the-look"
    Product ||--o{ Review : receives
    Review ||--o{ ReviewMedia : "photos"

    Category {
        uuid id PK
        uuid parent_id FK
        enum vertical "CURTAINS | BEDDING | SOFA_COVERS | ABAYAS | ACCESSORIES"
        string name_ar
        string name_en
        string slug_ar UK
        string slug_en UK
        jsonb description
        jsonb seo "localized title/description"
        int sort_order
        bool is_active
    }
    Attribute {
        uuid id PK
        string key UK "e.g. heading_style, bed_size, abaya_length"
        string name_ar
        string name_en
        enum type "SELECT | MULTISELECT | BOOLEAN | NUMBER | COLOR"
        string unit "cm, inch, tc ..."
        bool is_facet
        bool is_variant_axis
    }
    AttributeValue {
        uuid id PK
        uuid attribute_id FK
        string code
        string label_ar
        string label_en
        string swatch_hex
        uuid swatch_media_id FK
        decimal numeric_value
        int sort_order
    }
    Product {
        uuid id PK
        uuid category_id FK
        uuid brand_id FK
        string name_ar
        string name_en
        string slug_ar UK
        string slug_en UK
        jsonb description
        jsonb care_instructions
        jsonb seo
        enum pricing_mode "FIXED | PER_METER | PER_SQM | CALCULATED"
        int base_price_halalas "per unit / per metre / per m2"
        bool vat_inclusive
        enum status "DRAFT | ACTIVE | ARCHIVED"
        bool is_made_to_measure
        bool sample_available
        int sample_price_halalas
        enum photo_style "ON_MODEL | MANNEQUIN | FLAT_LAY"
        decimal rating_avg
        int rating_count
        timestamptz published_at
    }
    ProductVariant {
        uuid id PK
        uuid product_id FK
        string sku UK
        string barcode UK
        int price_halalas
        int compare_at_halalas
        int weight_grams
        int fabric_width_mm "for fabric sold by length"
        bool is_default
        bool is_active
    }
    MediaAsset {
        uuid id PK
        string storage_key
        string mime
        int width
        int height
        int bytes
        jsonb renditions "webp/avif sizes"
        jsonb alt "localized"
        enum kind "IMAGE | VIDEO"
    }
    SizeGuide {
        uuid id PK
        string key
        jsonb title
        jsonb table "localized rows/cols"
        jsonb how_to_measure "localized rich text + media"
    }
    Collection {
        uuid id PK
        string name_ar
        string name_en
        string slug_ar
        string slug_en
        enum type "MANUAL | SEASONAL | RAMADAN | EID | BACK_TO_SCHOOL"
        timestamptz starts_at
        timestamptz ends_at
    }
    Review {
        uuid id PK
        uuid product_id FK
        uuid user_id FK
        uuid order_item_id FK "verified purchase"
        int rating
        string body
        enum status "PENDING | APPROVED | REJECTED"
    }
```

## 3. Inventory

```mermaid
erDiagram
    Location ||--o{ StockLevel : holds
    ProductVariant ||--o{ StockLevel : "stocked as"
    Location ||--o{ StockMovement : ""
    ProductVariant ||--o{ StockMovement : ""
    Location ||--o{ FabricRoll : stores
    ProductVariant ||--o{ FabricRoll : "fabric of"
    FabricRoll ||--o{ StockMovement : "cut from"
    Location ||--o{ Stocktake : audits
    Stocktake ||--o{ StocktakeLine : counts

    Location {
        uuid id PK
        enum type "WAREHOUSE | BRANCH | WORKSHOP"
        string name_ar
        string name_en
        uuid city_id FK
        bool is_pickup_point
        jsonb opening_hours
    }
    StockLevel {
        uuid variant_id PK
        uuid location_id PK
        int on_hand "units; or cm for fabric"
        int reserved
        int low_stock_threshold
    }
    FabricRoll {
        uuid id PK
        uuid variant_id FK
        uuid location_id FK
        string roll_code UK
        int initial_length_cm
        int remaining_length_cm
        int width_mm
        string dye_lot
    }
    StockMovement {
        uuid id PK
        uuid variant_id FK
        uuid location_id FK
        uuid fabric_roll_id FK
        int quantity "signed"
        enum reason "PURCHASE | SALE | RETURN | ADJUSTMENT | TRANSFER | CUT | RESERVE | RELEASE"
        string ref_type
        uuid ref_id
        uuid actor_id FK
    }
```

## 4. Configurator (made-to-measure)

```mermaid
erDiagram
    ConfiguratorTemplate ||--o{ ConfiguratorStep : has
    ConfiguratorTemplate ||--o{ PricingRule : "priced by"
    ConfiguratorTemplate ||--o{ HeadingStyle : "allows (curtains)"
    ConfiguratorTemplate ||--o{ ConfiguratorOption : offers
    ConfiguratorTemplate ||--o{ SavedConfiguration : instantiates
    User ||--o{ SavedConfiguration : saves
    User ||--o{ MeasurementProfile : "saves (abaya)"
    SavedConfiguration ||--o| CartItem : "attached to"
    SavedConfiguration ||--o| OrderItem : "snapshotted into"

    ConfiguratorTemplate {
        uuid id PK
        enum kind "CURTAIN | BLIND | ABAYA | SOFA_COVER"
        string name_ar
        string name_en
        int version
        jsonb constants "side_hem_mm, overlap_mm, rounding, min/max dims ..."
        bool is_active
    }
    HeadingStyle {
        uuid id PK
        uuid template_id FK
        string code "WAVE | PINCH_PLEAT | EYELET | ROD_POCKET"
        string name_ar
        string name_en
        decimal fullness_min
        decimal fullness_max
        decimal fullness_default
        int making_cost_per_m_halalas
    }
    ConfiguratorOption {
        uuid id PK
        uuid template_id FK
        string group "LINING | TRACK | MOTOR | ACCESSORY | INSTALLATION | MOUNTING"
        string code
        string name_ar
        string name_en
        enum price_basis "FLAT | PER_METER | PER_SQM | PER_PANEL | PER_WIDTH_M"
        int price_halalas
        uuid linked_variant_id FK "optional stock item"
    }
    PricingRule {
        uuid id PK
        uuid template_id FK
        string key
        jsonb expression "validated formula AST, not eval"
    }
    SavedConfiguration {
        uuid id PK
        uuid user_id FK
        uuid template_id FK
        int template_version
        uuid product_id FK
        uuid variant_id FK
        jsonb inputs "dimensions, choices"
        jsonb computed "fabric_cm, breakdown, total"
        int total_halalas
        string preview_media_key
    }
    MeasurementProfile {
        uuid id PK
        uuid user_id FK
        string label
        jsonb measurements "length, chest, shoulder, sleeve (mm)"
        string notes
    }
```

## 5. Cart, Promotions, Orders, Payments, Invoicing, Returns

```mermaid
erDiagram
    Cart ||--o{ CartItem : contains
    User ||--o{ Cart : owns
    Cart }o--o{ Coupon : applies
    Promotion ||--o{ Coupon : "redeemed via"
    Promotion ||--o{ PromotionRedemption : ""
    Order ||--o{ OrderItem : contains
    Order ||--o{ Payment : "paid by"
    Payment ||--o{ Refund : ""
    Order ||--o{ Shipment : "fulfilled by"
    Shipment ||--o{ ShipmentItem : packs
    OrderItem ||--o{ ShipmentItem : ""
    Order ||--o{ OrderStatusEvent : history
    Order ||--o{ TaxInvoice : invoiced
    TaxInvoice ||--o{ TaxInvoiceLine : ""
    TaxInvoice ||--o| TaxInvoice : "credit note references"
    Order ||--o{ ReturnRequest : ""
    ReturnRequest ||--o{ ReturnItem : ""
    OrderItem ||--o| WorkshopJob : "made by"
    User ||--o{ Order : places
    Order ||--o{ PromotionRedemption : ""

    Cart {
        uuid id PK
        uuid user_id FK "null for guest"
        string guest_token UK
        enum status "ACTIVE | CONVERTED | ABANDONED"
        timestamptz last_activity_at
    }
    CartItem {
        uuid id PK
        uuid cart_id FK
        uuid variant_id FK
        uuid configuration_id FK
        int quantity
        bool gift_wrap
        string gift_message
    }
    Promotion {
        uuid id PK
        string name_ar
        string name_en
        enum type "PERCENT | FIXED | FREE_SHIPPING | BXGY | BUNDLE"
        jsonb conditions "min subtotal, categories, products, segments"
        jsonb benefit
        bool automatic
        int priority
        bool stackable
        int usage_limit
        int per_customer_limit
        timestamptz starts_at
        timestamptz ends_at
    }
    Coupon {
        uuid id PK
        uuid promotion_id FK
        string code UK
    }
    Order {
        uuid id PK
        string number UK "HD-2026-000123"
        uuid user_id FK
        string guest_email
        string guest_phone
        enum status "NEW | PAID | IN_PRODUCTION | READY | SHIPPED | INSTALLATION_SCHEDULED | DELIVERED | COMPLETED | CANCELLED"
        enum fulfilment "DELIVERY | PICKUP | INSTALLATION"
        jsonb shipping_address "snapshot"
        jsonb billing_address "snapshot"
        uuid pickup_location_id FK
        int subtotal_halalas
        int discount_halalas
        int shipping_halalas
        int cod_fee_halalas
        int vat_halalas
        int total_halalas
        enum locale "ar | en"
        string notes_internal
    }
    OrderItem {
        uuid id PK
        uuid order_id FK
        uuid variant_id FK
        jsonb product_snapshot "names, sku, attributes"
        jsonb configuration_snapshot "full workshop spec"
        int quantity
        int unit_price_halalas
        int discount_halalas
        int vat_rate_bp "basis points, 1500 = 15%"
        int vat_halalas
        int line_total_halalas
        bool is_returnable
    }
    Payment {
        uuid id PK
        uuid order_id FK
        string provider "moyasar | hyperpay | tap | tabby | tamara | cod"
        enum method "MADA | VISA | MASTERCARD | APPLE_PAY | STC_PAY | TABBY | TAMARA | COD"
        string provider_ref UK
        enum status "INITIATED | AUTHORIZED | CAPTURED | FAILED | REFUNDED | PARTIALLY_REFUNDED"
        int amount_halalas
        jsonb raw "sanitized, no PAN"
    }
    TaxInvoice {
        uuid id PK
        uuid order_id FK
        string number UK
        uuid uuid UK "ZATCA UUID"
        enum type "SIMPLIFIED | STANDARD"
        enum kind "INVOICE | CREDIT_NOTE | DEBIT_NOTE"
        uuid reference_invoice_id FK
        bigint icv "invoice counter value"
        string previous_hash "PIH"
        string invoice_hash
        text xml_signed
        text qr_tlv_base64
        enum zatca_status "PENDING | REPORTED | CLEARED | REJECTED"
        jsonb zatca_response
        timestamptz issued_at
    }
    ReturnRequest {
        uuid id PK
        uuid order_id FK
        enum reason "DEFECT | WRONG_ITEM | CHANGED_MIND | SIZE"
        enum status "REQUESTED | APPROVED | REJECTED | RECEIVED | REFUNDED | EXCHANGED"
        enum resolution "REFUND | EXCHANGE | STORE_CREDIT"
    }
    ReturnPolicy {
        uuid id PK
        string key
        jsonb title
        int window_days
        bool made_to_measure_defect_only
        bool requires_tags
        bool requires_sealed
        jsonb terms "localized"
    }
```

## 6. Fulfilment, Services, Workshop

```mermaid
erDiagram
    City ||--o{ District : contains
    ShippingZone ||--o{ ShippingZoneCity : covers
    City ||--o{ ShippingZoneCity : ""
    ShippingZone ||--o{ ShippingRate : prices
    Carrier ||--o{ ShippingRate : offers
    Carrier ||--o{ Shipment : carries
    Shipment ||--o{ TrackingEvent : ""

    ServiceArea ||--o{ ServiceAreaDistrict : covers
    ServiceArea ||--o{ TimeSlot : schedules
    Booking }o--|| TimeSlot : reserves
    Booking }o--o| Technician : "assigned to"
    Technician ||--o{ TechnicianShift : works
    Booking ||--o{ MeasurementRecord : produces
    MeasurementRecord ||--o{ MeasurementPhoto : ""
    Booking ||--o| Quotation : "results in"
    Quotation ||--o{ QuotationLine : ""
    Quotation ||--o| Order : "converted into"
    WorkshopJob }o--o| Tailor : "assigned to"

    City {
        uuid id PK
        string name_ar
        string name_en
        string region_code
        bool cod_allowed
    }
    ShippingRate {
        uuid id PK
        uuid zone_id FK
        uuid carrier_id FK
        int min_weight_g
        int max_weight_g
        int price_halalas
        int free_above_halalas
        int eta_min_days
        int eta_max_days
    }
    Shipment {
        uuid id PK
        uuid order_id FK
        uuid carrier_id FK
        string tracking_number
        string label_url
        enum status "PENDING | LABEL_CREATED | PICKED_UP | IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | FAILED | RETURNED"
    }
    Booking {
        uuid id PK
        string number UK
        uuid user_id FK
        uuid order_id FK "for installation"
        enum type "MEASUREMENT | INSTALLATION | MEASURE_AND_INSTALL"
        enum status "REQUESTED | CONFIRMED | ASSIGNED | EN_ROUTE | IN_PROGRESS | COMPLETED | CANCELLED | NO_SHOW"
        jsonb address "snapshot with lat/lng"
        uuid slot_id FK
        uuid technician_id FK
        int fee_halalas
        string signature_media_key
        timestamptz completed_at
    }
    TimeSlot {
        uuid id PK
        uuid service_area_id FK
        date date
        time starts_at
        time ends_at
        int capacity
        int booked
    }
    MeasurementRecord {
        uuid id PK
        uuid booking_id FK
        string room_label
        int width_mm
        int height_mm
        enum mounting "WALL | CEILING | RECESS"
        string notes
    }
    Quotation {
        uuid id PK
        uuid booking_id FK
        string number UK
        enum status "DRAFT | SENT | APPROVED | EXPIRED | CONVERTED"
        int total_halalas
        timestamptz valid_until
    }
    WorkshopJob {
        uuid id PK
        uuid order_item_id FK
        uuid tailor_id FK
        enum status "QUEUED | CUTTING | SEWING | QA | READY"
        date due_date
        uuid fabric_roll_id FK
    }
```

## 7. Content, Marketing, Notifications, Settings

```mermaid
erDiagram
    Banner }o--o| Collection : "links to"
    HomeBlock ||--o{ HomeBlockItem : ""
    NotificationTemplate ||--o{ NotificationLog : renders
    User ||--o{ NotificationLog : receives
    User ||--o{ PushDevice : registers
    User ||--o{ WishlistItem : ""
    User ||--o{ LoyaltyLedger : "earns/burns"
    User ||--o{ BackInStockSubscription : ""

    Banner {
        uuid id PK
        enum placement "HERO | STRIP | CATEGORY"
        jsonb title
        jsonb subtitle
        uuid media_ar_id FK "Arabic artwork"
        uuid media_en_id FK "English artwork"
        string link
        timestamptz starts_at
        timestamptz ends_at
        int sort_order
    }
    NotificationTemplate {
        uuid id PK
        string event "order.confirmed, otp, booking.reminder ..."
        enum channel "EMAIL | SMS | WHATSAPP | PUSH"
        string body_ar
        string body_en
        string subject_ar
        string subject_en
        string wa_template_name
    }
    NotificationLog {
        uuid id PK
        uuid user_id FK
        string event
        enum channel
        string to_masked
        enum status "QUEUED | SENT | DELIVERED | FAILED"
        string provider_ref
    }
    Setting {
        string key PK "store.name, tax.vat_rate_bp, zatca.*, modules.loyalty ..."
        jsonb value
        uuid updated_by FK
    }
    LegalPage {
        string key PK "privacy, terms, returns, shipping"
        jsonb title
        jsonb body
        string version
    }
```

---

## Key integrity rules

| Rule | Enforcement |
|---|---|
| Order and invoice lines are **snapshots**: later product edits never change history | `jsonb` snapshots on `OrderItem`, immutable `TaxInvoice` rows |
| ZATCA invoice chain: `previous_hash` of invoice *n* = `invoice_hash` of *n−1*; `icv` strictly increasing | Single-writer issuance inside a serializable transaction, with a row lock on the counter |
| Stock never goes negative unless backorder is allowed | `CHECK (on_hand - reserved >= 0)` plus a reservation on checkout and a timed release job |
| Slot capacity | `CHECK (booked <= capacity)` plus an atomic increment |
| A refresh-token reuse revokes the whole family | `Session.family_id` |
| Card data is never persisted | Only provider tokens and references, no PAN columns anywhere |
