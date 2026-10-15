-- Integrity rules Prisma cannot express (see docs/planning/01-erd.md "Key integrity rules").
ALTER TABLE "stock_levels"
  ADD CONSTRAINT "stock_levels_non_negative" CHECK ("on_hand" >= 0 AND "reserved" >= 0),
  ADD CONSTRAINT "stock_levels_reserved_le_on_hand" CHECK ("reserved" <= "on_hand");

ALTER TABLE "products"
  ADD CONSTRAINT "products_prices_non_negative" CHECK ("base_price" >= 0 AND ("compare_at_price" IS NULL OR "compare_at_price" >= 0) AND ("sample_price" IS NULL OR "sample_price" >= 0));

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_prices_non_negative" CHECK (("price" IS NULL OR "price" >= 0) AND ("compare_at_price" IS NULL OR "compare_at_price" >= 0));

-- A category cannot be its own parent.
ALTER TABLE "categories" ADD CONSTRAINT "categories_not_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- At most one default variant per product.
CREATE UNIQUE INDEX "product_variants_one_default" ON "product_variants" ("product_id") WHERE "is_default";
