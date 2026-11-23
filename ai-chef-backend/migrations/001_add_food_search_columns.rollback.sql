BEGIN;

ALTER TABLE public.foods
  DROP COLUMN IF EXISTS embedding,
  DROP COLUMN IF EXISTS ingredients;

COMMIT;
