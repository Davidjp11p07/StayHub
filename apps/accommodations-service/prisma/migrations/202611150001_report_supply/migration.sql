CREATE TABLE "ReportSupplyVersion" (
 "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 "propertyId" UUID NOT NULL,
 "ownerId" UUID NOT NULL,
 "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "name" VARCHAR(120) NOT NULL,
 "roomIds" JSONB NOT NULL CHECK(jsonb_typeof("roomIds") = 'array')
);
CREATE INDEX "ReportSupplyVersion_ownerId_capturedAt_id_idx" ON "ReportSupplyVersion"("ownerId","capturedAt","id");
-- Baseline only from migration time; no claim about earlier availability.
INSERT INTO "ReportSupplyVersion"("propertyId","ownerId","name","roomIds")
 SELECT p.id,p."ownerId",p.name,CASE WHEN p.status='PUBLISHED' THEN COALESCE((SELECT jsonb_agg(r.id ORDER BY r.id) FROM "Room" r WHERE r."propertyId"=p.id),'[]'::jsonb) ELSE '[]'::jsonb END FROM "Property" p;
