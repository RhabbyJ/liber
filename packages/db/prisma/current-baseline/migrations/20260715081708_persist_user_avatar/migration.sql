BEGIN;

UPDATE public."User"
SET "avatarVariant" = 'avatarka:animals:' || (
  get_byte(decode(md5(id::text), 'hex'), 0) % 32
)::text
WHERE "avatarVariant" IS NULL
   OR "avatarVariant" !~ '^avatarka:animals:([0-9]|[12][0-9]|3[01])$';

ALTER TABLE public."User"
  DROP CONSTRAINT IF EXISTS "User_avatarVariant_check",
  ADD CONSTRAINT "User_avatarVariant_check"
    CHECK ("avatarVariant" ~ '^avatarka:animals:([0-9]|[12][0-9]|3[01])$'),
  ALTER COLUMN "avatarVariant" SET DEFAULT (
    'avatarka:animals:' || floor(random() * 32)::integer::text
  ),
  ALTER COLUMN "avatarVariant" SET NOT NULL;

COMMIT;
