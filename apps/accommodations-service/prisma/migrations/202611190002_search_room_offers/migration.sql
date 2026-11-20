-- Capture room prices and capacities in the same transaction as the catalog snapshot.
CREATE FUNCTION stayhub_attach_search_room_offers() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.data := NEW.data || jsonb_build_object('rooms', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('roomId', id, 'capacity', capacity,
      'price', "basePriceAmount", 'currency', "basePriceCurrency") ORDER BY id)
    FROM "Room"
    WHERE "propertyId" = NEW."propertyId"
      AND "basePriceAmount" IS NOT NULL AND "basePriceCurrency" IS NOT NULL
  ), '[]'::jsonb));
  RETURN NEW;
END $$;

CREATE TRIGGER search_room_offers BEFORE INSERT ON "SearchProjectionOutbox"
FOR EACH ROW WHEN (NEW."eventType" = 'accommodation.search.v1.upserted')
EXECUTE FUNCTION stayhub_attach_search_room_offers();

SELECT stayhub_enqueue_search_snapshot(id) FROM "Property" WHERE status = 'PUBLISHED' ORDER BY id;
