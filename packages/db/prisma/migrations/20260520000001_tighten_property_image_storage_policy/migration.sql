-- Public buckets do not need a broad storage.objects SELECT policy for public
-- object URL access. Keeping the policy allows bucket listing through storage
-- APIs, so remove it and leave owner-scoped write policies in place.
DROP POLICY IF EXISTS "Property images are publicly readable" ON storage.objects;
