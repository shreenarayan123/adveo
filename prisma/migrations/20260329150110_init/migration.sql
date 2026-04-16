-- CreateTable
CREATE TABLE "public"."AdPattern" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "patterns" JSONB NOT NULL,
    "adCount" INTEGER NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdPattern_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdPattern_category_idx" ON "public"."AdPattern"("category");

-- CreateIndex
CREATE UNIQUE INDEX "AdPattern_category_theme_key" ON "public"."AdPattern"("category", "theme");
