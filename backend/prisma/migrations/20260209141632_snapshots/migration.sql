-- CreateTable
CREATE TABLE "DocSnapshot" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "state" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocSnapshot_docId_createdAt_idx" ON "DocSnapshot"("docId", "createdAt");

-- AddForeignKey
ALTER TABLE "DocSnapshot" ADD CONSTRAINT "DocSnapshot_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
