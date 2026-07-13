-- The unique search-term key already covers every column used by prefix lookup.
-- Keep one smaller index and give it the plan-regression contract name.

BEGIN;

DROP INDEX public.service_area_search_terms_market_term_prefix_idx;

ALTER TABLE public.service_area_search_terms
  RENAME CONSTRAINT service_area_search_terms_market_id_term_normalized_service_key
  TO service_area_search_terms_market_term_prefix_idx;

COMMIT;
