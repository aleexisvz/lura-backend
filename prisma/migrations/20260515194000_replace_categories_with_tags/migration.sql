CREATE TYPE "TagScope" AS ENUM ('MANGA', 'BOOK');

CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "scope" "TagScope" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MangaTag" (
    "mangaId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "MangaTag_pkey" PRIMARY KEY ("mangaId","tagId")
);

CREATE TABLE "BookTag" (
    "bookId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "BookTag_pkey" PRIMARY KEY ("bookId","tagId")
);

CREATE UNIQUE INDEX "Tag_scope_slug_key" ON "Tag"("scope", "slug");
CREATE INDEX "MangaTag_tagId_idx" ON "MangaTag"("tagId");
CREATE INDEX "BookTag_tagId_idx" ON "BookTag"("tagId");

ALTER TABLE "MangaTag" ADD CONSTRAINT "MangaTag_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "Manga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MangaTag" ADD CONSTRAINT "MangaTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookTag" ADD CONSTRAINT "BookTag_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookTag" ADD CONSTRAINT "BookTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Tag" ("id", "scope", "name", "slug", "createdAt", "updatedAt")
SELECT DISTINCT
    'tag_manga_' || md5(regexp_replace(lower(trim(cat)), '\s+', '-', 'g')) AS "id",
    'MANGA'::"TagScope" AS "scope",
    lower(trim(cat)) AS "name",
    regexp_replace(lower(trim(cat)), '\s+', '-', 'g') AS "slug",
    NOW() AS "createdAt",
    NOW() AS "updatedAt"
FROM "Manga" m
CROSS JOIN LATERAL unnest(m."categories") AS cat
WHERE trim(cat) <> '';

INSERT INTO "Tag" ("id", "scope", "name", "slug", "createdAt", "updatedAt")
SELECT DISTINCT
    'tag_book_' || md5(regexp_replace(lower(trim(cat)), '\s+', '-', 'g')) AS "id",
    'BOOK'::"TagScope" AS "scope",
    lower(trim(cat)) AS "name",
    regexp_replace(lower(trim(cat)), '\s+', '-', 'g') AS "slug",
    NOW() AS "createdAt",
    NOW() AS "updatedAt"
FROM "Book" b
CROSS JOIN LATERAL unnest(b."categories") AS cat
WHERE trim(cat) <> '';

INSERT INTO "MangaTag" ("mangaId", "tagId")
SELECT DISTINCT
    m."id" AS "mangaId",
    t."id" AS "tagId"
FROM "Manga" m
CROSS JOIN LATERAL unnest(m."categories") AS cat
INNER JOIN "Tag" t
    ON t."scope" = 'MANGA'
    AND t."slug" = regexp_replace(lower(trim(cat)), '\s+', '-', 'g')
WHERE trim(cat) <> '';

INSERT INTO "BookTag" ("bookId", "tagId")
SELECT DISTINCT
    b."id" AS "bookId",
    t."id" AS "tagId"
FROM "Book" b
CROSS JOIN LATERAL unnest(b."categories") AS cat
INNER JOIN "Tag" t
    ON t."scope" = 'BOOK'
    AND t."slug" = regexp_replace(lower(trim(cat)), '\s+', '-', 'g')
WHERE trim(cat) <> '';

ALTER TABLE "Manga" DROP COLUMN "categories";
ALTER TABLE "Book" DROP COLUMN "categories";
