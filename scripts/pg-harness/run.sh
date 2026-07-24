#!/usr/bin/env bash
# ============================================================================
# PGハーネス実行スクリプト — FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
# ローカル PostgreSQL 16 に対して migration + テスト一式を適用する。
# 実Supabase (PostgREST/GoTrue/Inbucket) の検証を代替するものではない。
#
# 使用法: PGHOST=/tmp PGPORT=5433 PGUSER=postgres ./run.sh
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
export PGHOST="${PGHOST:-/tmp}"
export PGPORT="${PGPORT:-5433}"
export PGUSER="${PGUSER:-postgres}"
DB=mortgage_harness
# HARNESS_VERBOSE=1 で各テストヘッダ・文をエコー（証跡用）
if [ "${HARNESS_VERBOSE:-0}" = "1" ]; then
  PSQL="psql -X -a -v ON_ERROR_STOP=1"
else
  PSQL="psql -X -q -v ON_ERROR_STOP=1"
fi
# 値取得は常に quiet（verbose モードのエコー混入防止）
PSQL_Q="psql -X -q -v ON_ERROR_STOP=1"

echo "== recreate database $DB =="
dropdb --if-exists "$DB"
createdb "$DB"

echo "== 00 shim (pseudo-Supabase) =="
$PSQL -d "$DB" -f "$HERE/00_shim_supabase.sql"

echo "== 01 test helpers =="
$PSQL -d "$DB" -f "$HERE/01_test_helpers.sql"

echo "== migration 0001 (ON_ERROR_STOP) =="
$PSQL -d "$DB" -f "$REPO/app/supabase/migrations/0001_phase1_identity_org_rls.sql"

echo "== seed (fictional bootstrap) =="
$PSQL -d "$DB" -f "$REPO/app/supabase/seed.sql"

echo "== 10 fixtures =="
$PSQL -d "$DB" -f "$HERE/10_fixtures.sql"

echo "== 20 functional tests =="
$PSQL -d "$DB" -f "$HERE/20_functional_tests.sql"

echo "== 30 security tests =="
$PSQL -d "$DB" -f "$HERE/30_security_tests.sql"

echo "== CONC-01 (org last-admin race) =="
psql -X -q -d "$DB" -f "$HERE/conc1_s1.sql" >/tmp/conc1_s1.out 2>&1 &
S1=$!
sleep 1
set +e
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/conc1_s2.sql" >/tmp/conc1_s2.out 2>&1
S2_RC=$?
set -e
wait "$S1"
if [ "$S2_RC" -eq 0 ]; then
  echo "TEST FAIL: CONC-01 second end_membership should have failed"; exit 1
fi
grep -q 'last_organization_admin_protected' /tmp/conc1_s2.out || {
  echo "TEST FAIL: CONC-01 unexpected error:"; cat /tmp/conc1_s2.out; exit 1; }
REMAIN=$($PSQL_Q -d "$DB" -t -A -c \
  "select count(*) from public.organization_memberships m
    join test.ids t on t.key='org_c' and t.id=m.organization_id
   where m.status='active' and m.role='ORGANIZATION_ADMIN'")
[ "$REMAIN" = "1" ] || { echo "TEST FAIL: CONC-01 remaining admins=$REMAIN"; exit 1; }
echo "CONC-01 PASSED"

echo "== CONC-02 (system admin revoke race) =="
psql -X -q -d "$DB" -f "$HERE/conc2_s1.sql" >/tmp/conc2_s1.out 2>&1 &
S1=$!
sleep 1
set +e
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/conc2_s2.sql" >/tmp/conc2_s2.out 2>&1
S2_RC=$?
set -e
wait "$S1"
if [ "$S2_RC" -eq 0 ]; then
  echo "TEST FAIL: CONC-02 second revoke should have failed"; exit 1
fi
grep -Eq 'not_authorized|last_system_admin_protected' /tmp/conc2_s2.out || {
  echo "TEST FAIL: CONC-02 unexpected error:"; cat /tmp/conc2_s2.out; exit 1; }
SYSADMINS=$($PSQL_Q -d "$DB" -t -A -c \
  "select count(*) from public.user_profiles where system_role='SYSTEM_ADMIN'")
[ "$SYSADMINS" = "1" ] || { echo "TEST FAIL: CONC-02 remaining sysadmins=$SYSADMINS"; exit 1; }
echo "CONC-02 PASSED"

echo ""
echo "==================================================="
echo " PG HARNESS: ALL TESTS PASSED"
echo " (real Supabase / PostgREST / GoTrue / Inbucket"
echo "  validation is still SUPABASE_PENDING)"
echo "==================================================="
