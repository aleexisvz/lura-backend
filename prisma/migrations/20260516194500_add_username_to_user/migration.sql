ALTER TABLE "User"
ADD COLUMN "username" TEXT;

WITH base_username AS (
  SELECT
    id,
    lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9_]', '', 'g')) AS raw_username
  FROM "User"
),
normalized_username AS (
  SELECT
    id,
    CASE
      WHEN raw_username IS NULL OR raw_username = '' THEN 'user'
      ELSE raw_username
    END AS base_username
  FROM base_username
),
ranked_username AS (
  SELECT
    id,
    base_username,
    row_number() OVER (PARTITION BY base_username ORDER BY id) AS duplicate_rank
  FROM normalized_username
)
UPDATE "User" u
SET "username" = CASE
  WHEN r.duplicate_rank = 1 THEN r.base_username
  ELSE r.base_username || '_' || r.duplicate_rank
END
FROM ranked_username r
WHERE u.id = r.id;

ALTER TABLE "User"
ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

