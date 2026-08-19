-- VECTR R8.3.3 — tenant-scoped uniqueness repair
BEGIN;

LOCK TABLE public.modules, public.batches, public.candidates, public.questions
IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT organization_id, code FROM public.modules
    GROUP BY organization_id, code HAVING count(*) > 1
  ) d;
  IF n > 0 THEN RAISE EXCEPTION 'R8.3.3 aborted: modules duplicate composite groups=%', n; END IF;

  SELECT count(*) INTO n FROM (
    SELECT organization_id, code FROM public.batches
    GROUP BY organization_id, code HAVING count(*) > 1
  ) d;
  IF n > 0 THEN RAISE EXCEPTION 'R8.3.3 aborted: batches duplicate composite groups=%', n; END IF;

  SELECT count(*) INTO n FROM (
    SELECT organization_id, candidate_code FROM public.candidates
    GROUP BY organization_id, candidate_code HAVING count(*) > 1
  ) d;
  IF n > 0 THEN RAISE EXCEPTION 'R8.3.3 aborted: candidates duplicate composite groups=%', n; END IF;

  SELECT count(*) INTO n FROM (
    SELECT module_id, code FROM public.questions
    GROUP BY module_id, code HAVING count(*) > 1
  ) d;
  IF n > 0 THEN RAISE EXCEPTION 'R8.3.3 aborted: questions duplicate composite groups=%', n; END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS exam_platform_modules_org_code_uidx_r5
  ON public.modules(organization_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS exam_platform_batches_org_code_uidx_r5
  ON public.batches(organization_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS exam_platform_candidates_org_code_uidx_r5
  ON public.candidates(organization_id, candidate_code);
CREATE UNIQUE INDEX IF NOT EXISTS exam_platform_questions_module_code_uidx_r5
  ON public.questions(module_id, code);

-- Drop UNIQUE constraints that incorrectly make tenant codes global.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname,
           (SELECT array_agg(a.attname::text ORDER BY u.ord)
            FROM unnest(c.conkey) WITH ORDINALITY u(attnum, ord)
            JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.attnum) AS cols
    FROM pg_constraint c
    WHERE c.contype='u'
      AND c.conrelid IN (
        'public.modules'::regclass,
        'public.batches'::regclass,
        'public.candidates'::regclass,
        'public.questions'::regclass
      )
  LOOP
    IF (r.tbl='modules'::regclass AND r.cols=ARRAY['code']::text[])
       OR (r.tbl='batches'::regclass AND r.cols=ARRAY['code']::text[])
       OR (r.tbl='candidates'::regclass AND r.cols=ARRAY['candidate_code']::text[])
       OR (r.tbl='questions'::regclass AND r.cols=ARRAY['code']::text[]) THEN
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    END IF;
  END LOOP;
END $$;

-- Drop standalone unique indexes with the same legacy global keys.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT i.indexrelid::regclass AS idx, i.indrelid::regclass AS tbl,
           (SELECT array_agg(a.attname::text ORDER BY u.ord)
            FROM unnest(string_to_array(trim(i.indkey::text),' ')::smallint[])
                 WITH ORDINALITY u(attnum,ord)
            JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=u.attnum) AS cols
    FROM pg_index i
    LEFT JOIN pg_constraint c ON c.conindid=i.indexrelid
    WHERE i.indisunique AND NOT i.indisprimary
      AND i.indpred IS NULL AND i.indexprs IS NULL
      AND c.oid IS NULL
      AND i.indrelid IN (
        'public.modules'::regclass,
        'public.batches'::regclass,
        'public.candidates'::regclass,
        'public.questions'::regclass
      )
  LOOP
    IF (r.tbl='modules'::regclass AND r.cols=ARRAY['code']::text[])
       OR (r.tbl='batches'::regclass AND r.cols=ARRAY['code']::text[])
       OR (r.tbl='candidates'::regclass AND r.cols=ARRAY['candidate_code']::text[])
       OR (r.tbl='questions'::regclass AND r.cols=ARRAY['code']::text[]) THEN
      EXECUTE format('DROP INDEX %s', r.idx);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Diagnostic after repair.
SELECT
  i.indrelid::regclass AS table_name,
  i.indexrelid::regclass AS index_name,
  i.indisunique,
  pg_get_indexdef(i.indexrelid) AS definition
FROM pg_index i
WHERE i.indrelid IN (
  'public.modules'::regclass,
  'public.batches'::regclass,
  'public.candidates'::regclass,
  'public.questions'::regclass
)
AND i.indisunique
ORDER BY 1,2;
