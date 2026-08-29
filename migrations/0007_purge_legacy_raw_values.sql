-- Remove legacy submitted values and make hash-only persistence a database invariant.
-- The application already stores only server-keyed, fact-scoped fingerprints.
-- This migration is idempotent and preserves rows, fingerprints, provenance and freshness metadata.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'observations_recent_value_json_redacted'
      AND conrelid = 'public.observations_recent'::regclass
  ) THEN
    ALTER TABLE public.observations_recent
      ADD CONSTRAINT observations_recent_value_json_redacted
      CHECK (value_json = 'null'::jsonb) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'facts_value_json_redacted'
      AND conrelid = 'public.facts'::regclass
  ) THEN
    ALTER TABLE public.facts
      ADD CONSTRAINT facts_value_json_redacted
      CHECK (current_value_json IS NULL AND previous_value_json IS NULL) NOT VALID;
  END IF;
END
$$;

UPDATE public.observations_recent
SET value_json = 'null'::jsonb
WHERE value_json <> 'null'::jsonb;

UPDATE public.facts
SET current_value_json = NULL,
    previous_value_json = NULL
WHERE current_value_json IS NOT NULL
   OR previous_value_json IS NOT NULL;

ALTER TABLE public.observations_recent
  VALIDATE CONSTRAINT observations_recent_value_json_redacted;

ALTER TABLE public.facts
  VALIDATE CONSTRAINT facts_value_json_redacted;
