BEGIN;

ALTER TABLE public.foods
  ADD COLUMN ingredients TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN embedding vector(768);

COMMENT ON COLUMN public.foods.ingredients IS
  'Structured ingredient names for this food; defaults to an empty list for existing records until curated.';

COMMENT ON COLUMN public.foods.embedding IS
  '768-dimensional semantic-search vector generated from this food using the configured embedding model; NULL until generated.';

COMMIT;
