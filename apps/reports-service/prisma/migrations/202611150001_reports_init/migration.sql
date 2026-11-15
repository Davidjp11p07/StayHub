CREATE TABLE "ReportSnapshot" (
 "key" CHAR(64) PRIMARY KEY,
 "ownerId" UUID NOT NULL,
 "payload" JSONB NOT NULL,
 "generatedAt" TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX "ReportSnapshot_ownerId_generatedAt_idx" ON "ReportSnapshot"("ownerId", "generatedAt");
