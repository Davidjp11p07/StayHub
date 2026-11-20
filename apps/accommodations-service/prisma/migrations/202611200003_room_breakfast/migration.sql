ALTER TABLE "Room" ADD COLUMN "breakfastAmount" decimal(12,2),
  ADD CONSTRAINT "Room_breakfast_price_check" CHECK (
    "breakfastAmount" IS NULL OR ("breakfastAmount" > 0 AND "basePriceAmount" IS NOT NULL AND "basePriceCurrency" IS NOT NULL)
  );
