BEGIN;
LOCK TABLE bookings IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE room_calendar (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL,
  property_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  arrival date NOT NULL,
  departure date NOT NULL CHECK (departure > arrival),
  maintenance boolean NOT NULL,
  CONSTRAINT room_calendar_no_overlap EXCLUDE USING gist
    (room_id WITH =, daterange(arrival, departure, '[)') WITH &&)
);
INSERT INTO room_calendar
SELECT id, "roomId", "propertyId", "ownerId", "checkIn", "checkOut", false
FROM bookings WHERE status IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN');
CREATE FUNCTION sync_booking_calendar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    DELETE FROM room_calendar WHERE id = OLD.id AND NOT maintenance;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.status IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN') THEN
    INSERT INTO room_calendar VALUES
      (NEW.id, NEW."roomId", NEW."propertyId", NEW."ownerId", NEW."checkIn", NEW."checkOut", false);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER booking_calendar AFTER INSERT OR DELETE OR UPDATE OF status,"checkIn","checkOut","roomId"
ON bookings FOR EACH ROW EXECUTE FUNCTION sync_booking_calendar();
COMMIT;
