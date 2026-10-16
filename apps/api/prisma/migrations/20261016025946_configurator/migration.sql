-- CreateEnum
CREATE TYPE "ConfiguratorKind" AS ENUM ('CURTAIN', 'BLIND', 'ABAYA', 'SOFA_COVER');

-- CreateEnum
CREATE TYPE "OptionPriceBasis" AS ENUM ('FLAT', 'PER_METER', 'PER_SQM', 'PER_PANEL', 'PER_WIDTH_M', 'PER_PIECE');

-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "configuration_id" UUID;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "configuration" JSONB,
ADD COLUMN     "configuration_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "configurator_template_id" UUID;

-- CreateTable
CREATE TABLE "configurator_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "ConfiguratorKind" NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "constants" JSONB NOT NULL DEFAULT '{}',
    "formulas" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configurator_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heading_styles" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "fullness_min" INTEGER NOT NULL,
    "fullness_max" INTEGER NOT NULL,
    "fullness_default" INTEGER NOT NULL,
    "making_cost_per_m" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "heading_styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configurator_options" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "group" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description_ar" TEXT,
    "description_en" TEXT,
    "price_basis" "OptionPriceBasis" NOT NULL,
    "price" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "configurator_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_configurations" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "user_id" UUID,
    "inputs" JSONB NOT NULL,
    "computed" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saved_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "measurements" JSONB NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "measurement_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_uploads" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "user_id" UUID,
    "configuration_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "configurator_templates_code_key" ON "configurator_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "heading_styles_template_id_code_key" ON "heading_styles"("template_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "configurator_options_template_id_group_code_key" ON "configurator_options"("template_id", "group", "code");

-- CreateIndex
CREATE INDEX "saved_configurations_user_id_idx" ON "saved_configurations"("user_id");

-- CreateIndex
CREATE INDEX "measurement_profiles_user_id_idx" ON "measurement_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_uploads_storage_key_key" ON "customer_uploads"("storage_key");

-- CreateIndex
CREATE INDEX "customer_uploads_configuration_id_idx" ON "customer_uploads"("configuration_id");

-- CreateIndex
CREATE INDEX "customer_uploads_created_at_idx" ON "customer_uploads"("created_at");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_configurator_template_id_fkey" FOREIGN KEY ("configurator_template_id") REFERENCES "configurator_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "saved_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heading_styles" ADD CONSTRAINT "heading_styles_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "configurator_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configurator_options" ADD CONSTRAINT "configurator_options_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "configurator_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_configurations" ADD CONSTRAINT "saved_configurations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "configurator_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_profiles" ADD CONSTRAINT "measurement_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_uploads" ADD CONSTRAINT "customer_uploads_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "saved_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity rules
ALTER TABLE "heading_styles"
  ADD CONSTRAINT "heading_styles_fullness" CHECK ("fullness_min" > 0 AND "fullness_min" <= "fullness_default" AND "fullness_default" <= "fullness_max" AND "fullness_max" <= 500),
  ADD CONSTRAINT "heading_styles_cost" CHECK ("making_cost_per_m" >= 0);
ALTER TABLE "configurator_options" ADD CONSTRAINT "configurator_options_price" CHECK ("price" >= 0);
ALTER TABLE "configurator_templates" ADD CONSTRAINT "configurator_templates_version" CHECK ("version" >= 1);
ALTER TABLE "saved_configurations" ADD CONSTRAINT "saved_configurations_total" CHECK ("total" >= 0);
ALTER TABLE "customer_uploads" ADD CONSTRAINT "customer_uploads_size" CHECK ("bytes" > 0 AND "width" > 0 AND "height" > 0);
