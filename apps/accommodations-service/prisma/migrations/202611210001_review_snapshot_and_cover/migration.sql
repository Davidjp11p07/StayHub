ALTER TABLE "PropertyVerification" ADD COLUMN "snapshot" JSONB;
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_propertyId_position_key" UNIQUE USING INDEX "Photo_propertyId_position_key" DEFERRABLE INITIALLY IMMEDIATE;
