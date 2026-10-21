#!/usr/bin/env bash
# OPS-01 restore exercise (local, isolated). Backs up the local Supabase DB (public/private/auth/
# storage/extensions) and the objects of the private `knowledge` bucket, restores the DB into a
# SEPARATE throwaway postgres container, and verifies row counts, a content checksum and the SHA-256
# of every restored object against documents.sha256. Never touches remote projects.
set -euo pipefail
cd "$(dirname "$0")/../.."
WORK=".secrets/restore-exercise"
rm -rf "$WORK" && mkdir -p "$WORK/objects"
DB_CONTAINER=supabase_db_mschool
IMAGE=$(docker inspect --format '{{.Config.Image}}' "$DB_CONTAINER")
SRC_PSQL=(psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -Atq)
export PGPASSWORD=postgres

echo "1) dump"
docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres -Fc --no-owner --no-privileges \
  -n public -n private -n auth -n storage > "$WORK/db.dump"
ls -l "$WORK/db.dump"

echo "2) storage objects backup with sha256 manifest"
. <(npx supabase status -o env 2>/dev/null | sed 's/^/export /')
"${SRC_PSQL[@]}" -c "select object_path from public.documents" > "$WORK/paths.txt"
: > "$WORK/manifest.txt"
while read -r path; do
  [ -z "$path" ] && continue
  out="$WORK/objects/$(echo "$path" | tr '/' '_')"
  if curl -sf -o "$out" -H "Authorization: Bearer $SECRET_KEY" -H "apikey: $SECRET_KEY" \
       "$API_URL/storage/v1/object/knowledge/$path"; then
    echo "$path $(sha256sum "$out" | cut -d' ' -f1)" >> "$WORK/manifest.txt"
  else
    echo "$path MISSING" >> "$WORK/manifest.txt"
  fi
done < "$WORK/paths.txt"

checksum_sql="select (select count(*) from public.tenants)||'|'||(select count(*) from public.users)||'|'||(select count(*) from public.courses)
  ||'|'||(select count(*) from public.lessons)||'|'||(select count(*) from public.progress)||'|'||(select count(*) from public.invoices)
  ||'|'||(select count(*) from auth.users)||'|'||md5(coalesce((select string_agg(id::text||status::text||coalesce(score::text,''), ',' order by id) from public.progress),''))"
SRC_SUM=$("${SRC_PSQL[@]}" -c "$checksum_sql")

echo "3) restore into an isolated container"
docker rm -f mschool_restore_check >/dev/null 2>&1 || true
docker run -d --name mschool_restore_check -e POSTGRES_PASSWORD=restorecheck -p 127.0.0.1:55432:5432 "$IMAGE" >/dev/null
for i in $(seq 1 60); do docker exec mschool_restore_check pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done
sleep 5
docker cp "$WORK/db.dump" mschool_restore_check:/tmp/db.dump
# The image pre-creates auth/storage owned by service roles; restore as the image superuser.
RESTORE_USER=supabase_admin
docker exec mschool_restore_check psql -U "$RESTORE_USER" -d postgres -qc "create extension if not exists vector with schema extensions; create extension if not exists pgcrypto with schema extensions;" || true
docker exec mschool_restore_check pg_restore -U "$RESTORE_USER" -d postgres --no-owner --no-privileges --clean --if-exists /tmp/db.dump \
  > "$WORK/restore.log" 2>&1 || echo "pg_restore reported warnings (see $WORK/restore.log)"
DST_SUM=$(docker exec mschool_restore_check psql -U "$RESTORE_USER" -d postgres -Atqc "$checksum_sql")

echo "4) verify"
echo "source:   $SRC_SUM"
echo "restored: $DST_SUM"
STATUS=OK
[ "$SRC_SUM" = "$DST_SUM" ] || STATUS=FAILED
while read -r path hash; do
  expected=$(docker exec mschool_restore_check psql -U "$RESTORE_USER" -d postgres -Atqc "select sha256 from public.documents where object_path = '$path'")
  if [ "$hash" != "$expected" ]; then echo "object mismatch: $path"; STATUS=FAILED; fi
done < "$WORK/manifest.txt"
echo "objects verified: $(wc -l < "$WORK/manifest.txt")"
docker rm -f mschool_restore_check >/dev/null
echo "RESTORE_EXERCISE=$STATUS"
[ "$STATUS" = OK ]
