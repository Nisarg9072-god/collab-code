-- CreateTable
CREATE TABLE "DocEvent" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "bytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocEvent_docId_createdAt_idx" ON "DocEvent"("docId", "createdAt");

-- CreateIndex
CREATE INDEX "DocEvent_userId_createdAt_idx" ON "DocEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "DocEvent" ADD CONSTRAINT "DocEvent_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
