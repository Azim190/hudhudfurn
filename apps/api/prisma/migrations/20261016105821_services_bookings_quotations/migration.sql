-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('MEASUREMENT', 'INSTALLATION');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "customer_uploads" ADD COLUMN     "measurement_id" UUID;

-- CreateTable
CREATE TABLE "service_areas" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "city_id" UUID NOT NULL,
    "types" "BookingType"[],
    "measurement_fee" INTEGER NOT NULL,
    "installation_fee" INTEGER NOT NULL,
    "free_installation_above" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_area_districts" (
    "area_id" UUID NOT NULL,
    "district_id" UUID NOT NULL,

    CONSTRAINT "service_area_districts_pkey" PRIMARY KEY ("area_id","district_id")
);

-- CreateTable
CREATE TABLE "time_slots" (
    "id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_profiles" (
    "user_id" UUID NOT NULL,
    "phone_e164" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "technician_areas" (
    "technician_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,

    CONSTRAINT "technician_areas_pkey" PRIMARY KEY ("technician_id","area_id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "BookingType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "area_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "technician_id" UUID,
    "order_id" UUID,
    "fee_order_id" UUID,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "locale" "Locale" NOT NULL DEFAULT 'ar',
    "contact_name" TEXT NOT NULL,
    "contact_phone_e164" TEXT NOT NULL,
    "address" JSONB NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "notes" TEXT,
    "product_id" UUID,
    "signature_upload_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_events" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus" NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_records" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "room_label" TEXT NOT NULL,
    "width_mm" INTEGER NOT NULL,
    "height_mm" INTEGER NOT NULL,
    "mounting" TEXT NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurement_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "booking_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "valid_until" TIMESTAMPTZ(3) NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "credit" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID,
    "order_id" UUID,
    "sent_at" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_lines" (
    "id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "measurement_id" UUID,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "configuration_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_areas_code_key" ON "service_areas"("code");

-- CreateIndex
CREATE INDEX "time_slots_area_id_date_idx" ON "time_slots"("area_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "time_slots_area_id_date_start_time_key" ON "time_slots"("area_id", "date", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_number_key" ON "bookings"("number");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_fee_order_id_key" ON "bookings"("fee_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_signature_upload_id_key" ON "bookings"("signature_upload_id");

-- CreateIndex
CREATE INDEX "bookings_user_id_created_at_idx" ON "bookings"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_technician_id_status_idx" ON "bookings"("technician_id", "status");

-- CreateIndex
CREATE INDEX "bookings_slot_id_idx" ON "bookings"("slot_id");

-- CreateIndex
CREATE INDEX "booking_events_booking_id_created_at_idx" ON "booking_events"("booking_id", "created_at");

-- CreateIndex
CREATE INDEX "measurement_records_booking_id_idx" ON "measurement_records"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_number_key" ON "quotations"("number");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_order_id_key" ON "quotations"("order_id");

-- CreateIndex
CREATE INDEX "quotations_user_id_created_at_idx" ON "quotations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "quotation_lines_quotation_id_idx" ON "quotation_lines"("quotation_id");

-- AddForeignKey
ALTER TABLE "customer_uploads" ADD CONSTRAINT "customer_uploads_measurement_id_fkey" FOREIGN KEY ("measurement_id") REFERENCES "measurement_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_area_districts" ADD CONSTRAINT "service_area_districts_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "service_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_area_districts" ADD CONSTRAINT "service_area_districts_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "service_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_profiles" ADD CONSTRAINT "technician_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_areas" ADD CONSTRAINT "technician_areas_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technician_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_areas" ADD CONSTRAINT "technician_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "service_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "service_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technician_profiles"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_fee_order_id_fkey" FOREIGN KEY ("fee_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_records" ADD CONSTRAINT "measurement_records_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "saved_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity rules
ALTER TABLE "time_slots"
  ADD CONSTRAINT "time_slots_capacity" CHECK ("capacity" BETWEEN 1 AND 100 AND "booked" BETWEEN 0 AND "capacity"),
  ADD CONSTRAINT "time_slots_times" CHECK ("start_time" ~ '^[0-2][0-9]:[0-5][0-9]$' AND "end_time" ~ '^[0-2][0-9]:[0-5][0-9]$' AND "end_time" > "start_time");
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_fees" CHECK ("measurement_fee" >= 0 AND "installation_fee" >= 0 AND ("free_installation_above" IS NULL OR "free_installation_above" >= 0));
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_fee" CHECK ("fee" >= 0);
ALTER TABLE "measurement_records" ADD CONSTRAINT "measurement_records_size" CHECK ("width_mm" > 0 AND "height_mm" > 0 AND "mounting" IN ('WALL', 'CEILING', 'RECESS'));
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_totals" CHECK ("subtotal" >= 0 AND "credit" BETWEEN 0 AND "subtotal" AND "total" = "subtotal" - "credit");
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_amounts" CHECK ("quantity" BETWEEN 1 AND 50 AND "unit_price" >= 0);
