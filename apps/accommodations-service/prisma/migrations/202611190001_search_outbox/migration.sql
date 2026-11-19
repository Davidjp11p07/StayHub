-- Transactional snapshots: each committed catalog mutation leaves a durable message.
CREATE TABLE "SearchProjectionOutbox" (
  "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "eventId" UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  "propertyId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "data" JSONB,
  "photoId" UUID,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ
);
CREATE INDEX "SearchProjectionOutbox_pending_idx" ON "SearchProjectionOutbox" ("id") WHERE "publishedAt" IS NULL;

CREATE FUNCTION stayhub_enqueue_search_snapshot(property_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE p "Property"%ROWTYPE; selected_currency TEXT; snapshot JSONB; cover UUID;
BEGIN
  SELECT * INTO p FROM "Property" WHERE id = property_id;
  IF NOT FOUND OR p.status <> 'PUBLISHED' THEN
    INSERT INTO "SearchProjectionOutbox" ("propertyId", "eventType") VALUES (property_id, 'accommodation.search.v1.removed');
    RETURN;
  END IF;
  SELECT "basePriceCurrency" INTO selected_currency FROM "Room"
    WHERE "propertyId" = property_id AND "basePriceAmount" IS NOT NULL AND "basePriceCurrency" IS NOT NULL
    ORDER BY "createdAt", id LIMIT 1;
  IF selected_currency IS NULL THEN
    INSERT INTO "SearchProjectionOutbox" ("propertyId", "eventType") VALUES (property_id, 'accommodation.search.v1.removed');
    RETURN;
  END IF;
  SELECT id INTO cover FROM "Photo" WHERE "propertyId" = property_id ORDER BY position, id LIMIT 1;
  SELECT jsonb_build_object(
    'published', true, 'name', p.name, 'description', COALESCE(p.description, ''),
    'countryCode', p.country, 'region', p.region, 'city', p.city, 'addressSummary', p."addressLine",
    'latitude', p.latitude, 'longitude', p.longitude,
    'minNightlyPrice', (SELECT min("basePriceAmount") FROM "Room" WHERE "propertyId" = property_id AND "basePriceCurrency" = selected_currency),
    'currency', selected_currency,
    'capacity', (SELECT max(capacity) FROM "Room" WHERE "propertyId" = property_id),
    'amenities', COALESCE((SELECT jsonb_agg("featureCode" ORDER BY "featureCode") FROM "PropertyFeature" WHERE "propertyId" = property_id), '[]'::jsonb),
    'keywords', '[]'::jsonb, 'availability', '[]'::jsonb,
    'sourceUpdatedAt', to_char(p."updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) INTO snapshot;
  INSERT INTO "SearchProjectionOutbox" ("propertyId", "eventType", "data", "photoId")
    VALUES (property_id, 'accommodation.search.v1.upserted', snapshot, cover);
END $$;

CREATE FUNCTION stayhub_search_property_trigger() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM stayhub_enqueue_search_snapshot(CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END);
  RETURN NULL;
END $$;
CREATE FUNCTION stayhub_search_child_trigger() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM stayhub_enqueue_search_snapshot(CASE WHEN TG_OP = 'DELETE' THEN OLD."propertyId" ELSE NEW."propertyId" END);
  RETURN NULL;
END $$;
CREATE TRIGGER search_property AFTER INSERT OR UPDATE OR DELETE ON "Property" FOR EACH ROW EXECUTE FUNCTION stayhub_search_property_trigger();
CREATE TRIGGER search_room AFTER INSERT OR UPDATE OR DELETE ON "Room" FOR EACH ROW EXECUTE FUNCTION stayhub_search_child_trigger();
CREATE TRIGGER search_photo AFTER INSERT OR UPDATE OR DELETE ON "Photo" FOR EACH ROW EXECUTE FUNCTION stayhub_search_child_trigger();
CREATE TRIGGER search_feature AFTER INSERT OR UPDATE OR DELETE ON "PropertyFeature" FOR EACH ROW EXECUTE FUNCTION stayhub_search_child_trigger();

-- Preserve and project existing records; no existing data is rewritten.
SELECT stayhub_enqueue_search_snapshot(id) FROM "Property" ORDER BY id;
