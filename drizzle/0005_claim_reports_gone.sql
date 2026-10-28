-- ADR 0011, "Clean-up": a save's touch can wait on the clean-up's lock on the same claim. Once the
-- clean-up commits, the touch's UPDATE finds no row, and the function used to answer 'touched'
-- anyway. It now answers 'gone', so the save rolls back instead of writing into a deleted copy.
-- CREATE OR REPLACE keeps the function's owner and privileges; the rest is 0004's, unchanged.
CREATE OR REPLACE FUNCTION app.claim_visitor_copy(hash bytea, organization uuid) RETURNS text
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  mapped uuid;
BEGIN
  SELECT v.organization_id INTO mapped FROM public.visitor_copies v WHERE v.token_hash = hash;
  IF FOUND THEN
    IF mapped <> organization THEN
      RETURN 'taken';
    END IF;
    UPDATE public.visitor_copies v SET last_saved_at = now() WHERE v.token_hash = hash;
    RETURN CASE WHEN FOUND THEN 'touched' ELSE 'gone' END;
  END IF;

  -- Keyed on the table itself, so the lock cannot collide with another advisory lock.
  PERFORM pg_advisory_xact_lock('public.visitor_copies'::regclass::oid::int, 0);
  IF (SELECT count(*) FROM public.visitor_copies v WHERE v.created_at > now() - interval '1 day')
     >= 200 THEN
    RETURN 'limit';
  END IF;
  INSERT INTO public.visitor_copies (token_hash, organization_id)
    VALUES (hash, organization)
    ON CONFLICT DO NOTHING;
  RETURN CASE WHEN FOUND THEN 'claimed' ELSE 'taken' END;
END
$$;
