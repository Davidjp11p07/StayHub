ALTER TABLE bookings
  ADD COLUMN "breakfastUnitAmount" numeric(12,2),
  ADD COLUMN "breakfastAmount" numeric(12,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT bookings_breakfast_amount_check CHECK (
    ("breakfastUnitAmount" IS NULL AND "breakfastAmount" = 0)
    OR ("breakfastUnitAmount" IS NOT NULL AND "breakfastUnitAmount" > 0
        AND "breakfastAmount" = "breakfastUnitAmount" * guests * nights
        AND "totalAmount" = "nightlyPriceAmount" * nights + "breakfastAmount")
  );
