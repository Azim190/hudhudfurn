-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'MERGED', 'CONVERTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('HERO', 'STRIP', 'CATEGORY');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "guest_token_hash" TEXT,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "length_cm" INTEGER,
    "width_mm" INTEGER,
    "height_mm" INTEGER,
    "gift_wrap" BOOLEAN NOT NULL DEFAULT false,
    "gift_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("user_id","product_id")
);

-- CreateTable
CREATE TABLE "back_in_stock_subscriptions" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'ar',
    "notified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "back_in_stock_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "placement" "BannerPlacement" NOT NULL DEFAULT 'HERO',
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT,
    "subtitle_ar" TEXT,
    "subtitle_en" TEXT,
    "cta_ar" TEXT,
    "cta_en" TEXT,
    "link" TEXT,
    "image_ar_id" UUID,
    "image_en_id" UUID,
    "category_id" UUID,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "user_id" UUID,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'ar',
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "author_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carts_guest_token_hash_key" ON "carts"("guest_token_hash");

-- CreateIndex
CREATE INDEX "carts_user_id_status_idx" ON "carts"("user_id", "status");

-- CreateIndex
CREATE INDEX "carts_status_last_activity_at_idx" ON "carts"("status", "last_activity_at");

-- CreateIndex
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items"("cart_id");

-- CreateIndex
CREATE INDEX "wishlist_items_product_id_idx" ON "wishlist_items"("product_id");

-- CreateIndex
CREATE INDEX "back_in_stock_subscriptions_variant_id_notified_at_idx" ON "back_in_stock_subscriptions"("variant_id", "notified_at");

-- CreateIndex
CREATE UNIQUE INDEX "back_in_stock_subscriptions_variant_id_user_id_key" ON "back_in_stock_subscriptions"("variant_id", "user_id");

-- CreateIndex
CREATE INDEX "banners_placement_is_active_sort_order_idx" ON "banners"("placement", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "reviews_product_id_status_created_at_idx" ON "reviews"("product_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "back_in_stock_subscriptions" ADD CONSTRAINT "back_in_stock_subscriptions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "back_in_stock_subscriptions" ADD CONSTRAINT "back_in_stock_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_image_ar_id_fkey" FOREIGN KEY ("image_ar_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_image_en_id_fkey" FOREIGN KEY ("image_en_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity rules (see ADR-0003 style CHECKs)
ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_quantity_range" CHECK ("quantity" BETWEEN 1 AND 99),
  ADD CONSTRAINT "cart_items_measurements_positive" CHECK (("length_cm" IS NULL OR "length_cm" > 0) AND ("width_mm" IS NULL OR "width_mm" > 0) AND ("height_mm" IS NULL OR "height_mm" > 0));
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
-- One active cart per customer.
CREATE UNIQUE INDEX "carts_one_active_per_user" ON "carts" ("user_id") WHERE "status" = 'ACTIVE' AND "user_id" IS NOT NULL;
