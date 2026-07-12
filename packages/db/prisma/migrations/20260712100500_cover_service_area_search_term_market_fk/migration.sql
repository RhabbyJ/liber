-- Cover the composite same-market foreign key reported by the production advisor.
DROP INDEX IF EXISTS public.service_area_search_terms_area_idx;
CREATE INDEX service_area_search_terms_area_idx
ON public.service_area_search_terms(service_area_id, market_id);
