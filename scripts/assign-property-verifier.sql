-- Run as the authorized Users database operator with psql -v user_id=<uuid> -f this-file.
-- Use a dedicated, active guest account. Sign in again after assignment.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('stayhub.verifier_user_id', :'user_id', true);
DO $assignment$
DECLARE
  target_id uuid := current_setting('stayhub.verifier_user_id')::uuid;
  target_role "Role";
BEGIN
  SELECT role INTO target_role FROM "User"
    WHERE id = target_id AND status = 'ACTIVE' FOR UPDATE;
  IF target_role = 'GUEST' THEN
    UPDATE "User" SET role = 'VERIFIER', version = version + 1, "updatedAt" = now()
      WHERE id = target_id;
  ELSIF target_role IS DISTINCT FROM 'VERIFIER' THEN
    RAISE EXCEPTION 'Expected an active guest or an already assigned verifier';
  END IF;
END;
$assignment$;
COMMIT;
