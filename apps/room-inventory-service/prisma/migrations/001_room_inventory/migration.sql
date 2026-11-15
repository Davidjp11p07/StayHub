-- Room Inventory (Sprint 4). Mirrors prisma/schema.prisma plus CHECK constraints Prisma cannot express.
-- room_id, property_id and owner_id reference Accommodations by opaque UUID: there is no FK to another service.

CREATE TYPE "inventory_item_type" AS ENUM ('PRODUCT', 'SERVICE');

CREATE TABLE "room_inventories" (
    "room_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_inventories_pkey" PRIMARY KEY ("room_id"),
    -- A persisted aggregate always has at least one write; version 0 only exists as the synthetic empty read.
    CONSTRAINT "room_inventories_version_check" CHECK ("version" >= 1)
);

CREATE INDEX "room_inventories_owner_updated_idx" ON "room_inventories"("owner_id", "updated_at");

CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "type" "inventory_item_type" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "quantity_available" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_items_quantity_check" CHECK ("quantity_available" BETWEEN 0 AND 1000000),
    -- Stored names are already trimmed and non-empty (1..120 characters).
    CONSTRAINT "inventory_items_name_check" CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 120)
);

CREATE INDEX "inventory_items_room_active_idx" ON "inventory_items"("room_id", "active");
CREATE INDEX "inventory_items_room_type_idx" ON "inventory_items"("room_id", "type");

-- Local FK only (item -> aggregate in the same database).
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room_inventories"("room_id") ON DELETE CASCADE ON UPDATE CASCADE;
