CREATE TYPE "VerificationStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TABLE "PropertyVerification" (
  "propertyId" uuid NOT NULL REFERENCES "Property"(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  "requestedBy" uuid NOT NULL,
  "requestedAt" timestamptz(6) NOT NULL DEFAULT now(),
  status "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  "reviewerId" uuid,
  reason varchar(1000),
  "decidedAt" timestamptz(6),
  PRIMARY KEY ("propertyId", version),
  CHECK ((status = 'PENDING' AND "reviewerId" IS NULL AND reason IS NULL AND "decidedAt" IS NULL)
      OR (status <> 'PENDING' AND "reviewerId" IS NOT NULL AND "reviewerId" <> "requestedBy"
          AND reason IS NOT NULL AND length(trim(reason)) > 0 AND "decidedAt" IS NOT NULL))
);
CREATE INDEX "PropertyVerification_status_requestedAt_idx" ON "PropertyVerification"(status, "requestedAt");
