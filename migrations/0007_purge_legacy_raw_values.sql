-- L2 privacy minimization: remove legacy submitted values after hash-only persistence is deployed.
-- Idempotent by design. CHECK/OBSERVE semantics use value_hash and do not require these payloads.

UPDATE observations_recent
SET value_json = 'null'::jsonb
WHERE value_json <> 'null'::jsonb;

UPDATE facts
SET current_value_json = NULL,
    previous_value_json = NULL
WHERE current_value_json IS NOT NULL
   OR previous_value_json IS NOT NULL;
