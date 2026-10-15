-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT', 'FIXED', 'FREE_SHIPPING', 'BXGY', 'BUNDLE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'PAID', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'INSTALLATION_SCHEDULED', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'PICKUP');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'TABBY', 'TAMARA', 'COD');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('SIMULATOR', 'MOYASAR', 'TABBY', 'TAMARA', 'COD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "OrderPaymentState" AS ENUM ('UNPAID', 'PAID', 'PAY_ON_DELIVERY', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'COMMITTED', 'RELEASED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "ZatcaStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'REPORTED', 'REPORTED_WITH_WARNINGS', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "shipping_zones" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipping_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zone_cities" (
    "zone_id" UUID NOT NULL,
    "city_code" TEXT NOT NULL,

    CONSTRAINT "shipping_zone_cities_pkey" PRIMARY KEY ("zone_id","city_code")
);

-- CreateTable
CREATE TABLE "shipping_rates" (
    "id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "carrier" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "min_weight_g" INTEGER NOT NULL DEFAULT 0,
    "max_weight_g" INTEGER,
    "price" INTEGER NOT NULL,
    "free_above" INTEGER,
    "eta_min_days" INTEGER NOT NULL,
    "eta_max_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "benefit" JSONB NOT NULL DEFAULT '{}',
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "usage_limit" INTEGER,
    "per_customer_limit" INTEGER,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "promotion_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "usage_limit" INTEGER,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_redemptions" (
    "id" UUID NOT NULL,
    "promotion_id" UUID NOT NULL,
    "coupon_id" UUID,
    "order_id" UUID NOT NULL,
    "user_id" UUID,
    "phone_e164" TEXT NOT NULL,
    "discount" INTEGER NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "user_id" UUID,
    "locale" "Locale" NOT NULL DEFAULT 'ar',
    "contact_name" TEXT NOT NULL,
    "contact_phone_e164" TEXT NOT NULL,
    "contact_email" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_state" "OrderPaymentState" NOT NULL DEFAULT 'UNPAID',
    "fulfillment" "FulfillmentType" NOT NULL,
    "shipping_address" JSONB,
    "city_code" TEXT,
    "shipping_rate_id" UUID,
    "shipping_carrier" TEXT,
    "shipping_method" TEXT,
    "shipping_name_ar" TEXT,
    "shipping_name_en" TEXT,
    "pickup_location_id" UUID,
    "eta_min_days" INTEGER,
    "eta_max_days" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "vat_rate_bp" INTEGER NOT NULL,
    "prices_include_vat" BOOLEAN NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "gift_wrap_total" INTEGER NOT NULL DEFAULT 0,
    "shipping_total" INTEGER NOT NULL DEFAULT 0,
    "cod_fee" INTEGER NOT NULL DEFAULT 0,
    "net" INTEGER NOT NULL,
    "vat" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "refunded_total" INTEGER NOT NULL DEFAULT 0,
    "coupon_code" TEXT,
    "pricing" JSONB NOT NULL DEFAULT '{}',
    "customer_note" TEXT,
    "cart_id" UUID,
    "expires_at" TIMESTAMPTZ(3),
    "placed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID,
    "product_id" UUID,
    "sku" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "options" JSONB NOT NULL DEFAULT '[]',
    "image_url" TEXT,
    "pricing_mode" "PricingMode" NOT NULL,
    "is_made_to_measure" BOOLEAN NOT NULL,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "length_cm" INTEGER,
    "width_mm" INTEGER,
    "height_mm" INTEGER,
    "billed_measure" INTEGER,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "gift_wrap" BOOLEAN NOT NULL DEFAULT false,
    "gift_wrap_total" INTEGER NOT NULL DEFAULT 0,
    "gift_message" TEXT,
    "net" INTEGER NOT NULL,
    "vat" INTEGER NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "weight_grams" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "provider_ref" TEXT,
    "redirect_url" TEXT,
    "source_summary" TEXT,
    "failure_code" TEXT,
    "failure_reason" TEXT,
    "raw" JSONB,
    "authorized_at" TIMESTAMPTZ(3),
    "captured_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "provider_ref" TEXT,
    "credit_note_id" UUID,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(3),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" INTEGER,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("scope","key")
);

-- CreateTable
CREATE TABLE "document_counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "tax_invoices" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "number" TEXT NOT NULL,
    "uuid" UUID NOT NULL,
    "icv" INTEGER NOT NULL,
    "previous_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "qr" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "net" INTEGER NOT NULL,
    "vat" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "original_id" UUID,
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "zatca_status" "ZatcaStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "zatca_response" JSONB,
    "zatca_attempts" INTEGER NOT NULL DEFAULT 0,
    "reported_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_chain" (
    "id" TEXT NOT NULL,
    "last_icv" INTEGER NOT NULL DEFAULT 0,
    "last_hash" TEXT NOT NULL,

    CONSTRAINT "invoice_chain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipping_zones_code_key" ON "shipping_zones"("code");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_zone_cities_city_code_key" ON "shipping_zone_cities"("city_code");

-- CreateIndex
CREATE INDEX "shipping_rates_zone_id_is_active_idx" ON "shipping_rates"("zone_id", "is_active");

-- CreateIndex
CREATE INDEX "promotions_is_active_automatic_idx" ON "promotions"("is_active", "automatic");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "promotion_redemptions_promotion_id_phone_e164_idx" ON "promotion_redemptions"("promotion_id", "phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_redemptions_promotion_id_order_id_key" ON "promotion_redemptions"("promotion_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE INDEX "orders_user_id_placed_at_idx" ON "orders"("user_id", "placed_at");

-- CreateIndex
CREATE INDEX "orders_status_placed_at_idx" ON "orders"("status", "placed_at");

-- CreateIndex
CREATE INDEX "orders_contact_phone_e164_idx" ON "orders"("contact_phone_e164");

-- CreateIndex
CREATE INDEX "orders_payment_state_expires_at_idx" ON "orders"("payment_state", "expires_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE INDEX "order_status_events_order_id_created_at_idx" ON "order_status_events"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_reservations_order_id_status_idx" ON "stock_reservations"("order_id", "status");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_ref_key" ON "payments"("provider", "provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_credit_note_id_key" ON "refunds"("credit_note_id");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoices_number_key" ON "tax_invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoices_uuid_key" ON "tax_invoices"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoices_icv_key" ON "tax_invoices"("icv");

-- CreateIndex
CREATE UNIQUE INDEX "tax_invoices_hash_key" ON "tax_invoices"("hash");

-- CreateIndex
CREATE INDEX "tax_invoices_order_id_idx" ON "tax_invoices"("order_id");

-- CreateIndex
CREATE INDEX "tax_invoices_zatca_status_idx" ON "tax_invoices"("zatca_status");

-- AddForeignKey
ALTER TABLE "shipping_zone_cities" ADD CONSTRAINT "shipping_zone_cities_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "shipping_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "shipping_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_location_id_fkey" FOREIGN KEY ("pickup_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "tax_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_invoices" ADD CONSTRAINT "tax_invoices_original_id_fkey" FOREIGN KEY ("original_id") REFERENCES "tax_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity rules
ALTER TABLE "shipping_rates"
  ADD CONSTRAINT "shipping_rates_amounts" CHECK ("price" >= 0 AND ("free_above" IS NULL OR "free_above" >= 0)),
  ADD CONSTRAINT "shipping_rates_weights" CHECK ("min_weight_g" >= 0 AND ("max_weight_g" IS NULL OR "max_weight_g" >= "min_weight_g")),
  ADD CONSTRAINT "shipping_rates_eta" CHECK ("eta_min_days" >= 0 AND "eta_max_days" >= "eta_min_days");
ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_limits" CHECK ("usage_count" >= 0 AND ("usage_limit" IS NULL OR "usage_limit" > 0) AND ("per_customer_limit" IS NULL OR "per_customer_limit" > 0)),
  ADD CONSTRAINT "promotions_dates" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");
ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_code_upper" CHECK ("code" = upper("code") AND length("code") BETWEEN 3 AND 32),
  ADD CONSTRAINT "coupons_limits" CHECK ("usage_count" >= 0 AND ("usage_limit" IS NULL OR "usage_limit" > 0));
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_discount" CHECK ("discount" >= 0);
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_amounts_non_negative" CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "gift_wrap_total" >= 0 AND "shipping_total" >= 0 AND "cod_fee" >= 0 AND "net" >= 0 AND "vat" >= 0 AND "total" >= 0),
  ADD CONSTRAINT "orders_total_balances" CHECK ("net" + "vat" = "total"),
  ADD CONSTRAINT "orders_refund_bounded" CHECK ("refunded_total" BETWEEN 0 AND "total"),
  ADD CONSTRAINT "orders_fulfillment_target" CHECK (("fulfillment" = 'DELIVERY' AND "shipping_address" IS NOT NULL) OR ("fulfillment" = 'PICKUP' AND "pickup_location_id" IS NOT NULL));
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_amounts" CHECK ("unit_price" >= 0 AND "discount" >= 0 AND "gift_wrap_total" >= 0 AND "net" >= 0 AND "vat" >= 0),
  ADD CONSTRAINT "order_items_total_balances" CHECK ("net" + "vat" = "total");
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_quantity" CHECK ("quantity" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount" CHECK ("amount" >= 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount" CHECK ("amount" > 0);
ALTER TABLE "tax_invoices"
  ADD CONSTRAINT "tax_invoices_total_balances" CHECK ("net" + "vat" = "total" AND "net" >= 0 AND "vat" >= 0),
  ADD CONSTRAINT "tax_invoices_icv_positive" CHECK ("icv" > 0),
  ADD CONSTRAINT "tax_invoices_credit_reference" CHECK (("kind" = 'CREDIT_NOTE') = ("original_id" IS NOT NULL));
ALTER TABLE "invoice_chain" ADD CONSTRAINT "invoice_chain_icv" CHECK ("last_icv" >= 0);
-- Only one non-failed payment session may be live per order at a time.
CREATE UNIQUE INDEX "payments_one_pending_per_order" ON "payments" ("order_id") WHERE "status" IN ('PENDING', 'AUTHORIZED');
-- Issued tax documents are immutable (ZATCA): only the reporting columns may change, and rows cannot be deleted.
CREATE FUNCTION tax_invoices_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'tax invoices cannot be deleted';
  END IF;
  IF NEW.number <> OLD.number OR NEW.uuid <> OLD.uuid OR NEW.icv <> OLD.icv OR NEW.hash <> OLD.hash OR NEW.previous_hash <> OLD.previous_hash
     OR NEW.xml <> OLD.xml OR NEW.signature <> OLD.signature OR NEW.qr <> OLD.qr OR NEW.total <> OLD.total OR NEW.vat <> OLD.vat OR NEW.net <> OLD.net
     OR NEW.issued_at <> OLD.issued_at OR NEW.kind <> OLD.kind THEN
    RAISE EXCEPTION 'issued tax invoices are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER tax_invoices_immutable BEFORE UPDATE OR DELETE ON "tax_invoices" FOR EACH ROW EXECUTE FUNCTION tax_invoices_immutable();
