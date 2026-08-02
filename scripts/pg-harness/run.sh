#!/usr/bin/env bash
# ============================================================================
# PGハーネス実行スクリプト — FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
# ローカル PostgreSQL 16 に対して migration + テスト一式を適用する。
# 実Supabase (PostgREST/GoTrue/Mailpit) の検証を代替するものではない。
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

echo "== migration 0002 (Phase 2A-1 customer cases, ON_ERROR_STOP) =="
$PSQL -d "$DB" -f "$REPO/app/supabase/migrations/0002_phase2a_customer_cases.sql"

echo "== migration 0003 (Phase 2A-2a applicant profile, ON_ERROR_STOP) =="
$PSQL -d "$DB" -f "$REPO/app/supabase/migrations/0003_phase2a2_applicant_profile.sql"

echo "== migration 0004 (Phase 2A-2b partner loans, ON_ERROR_STOP) =="
$PSQL -d "$DB" -f "$REPO/app/supabase/migrations/0004_phase2b_partner_loans.sql"

echo "== migration 0005 (Phase 2A-3a employment/income, ON_ERROR_STOP) =="
$PSQL -d "$DB" -f "$REPO/app/supabase/migrations/0005_phase2a3a_employment_income.sql"

echo "== migration 0006 (Phase 2A-W1 organization branding, ON_ERROR_STOP) =="
$PSQL -d "$DB" -f "$REPO/app/supabase/migrations/0006_phase2aw1_organization_branding.sql"

echo "== seed (fictional bootstrap) =="
$PSQL -d "$DB" -f "$REPO/app/supabase/seed.sql"

echo "== 10 fixtures =="
$PSQL -d "$DB" -f "$HERE/10_fixtures.sql"

echo "== 20 functional tests =="
$PSQL -d "$DB" -f "$HERE/20_functional_tests.sql"

echo "== 30 security tests =="
$PSQL -d "$DB" -f "$HERE/30_security_tests.sql"

echo "== CONC-03 / SEC-62..65 (org management vs system-admin revoke race) =="
# s1 が U10 の SYSTEM_ADMIN を revoke（グローバルロック保持）。
# その間に U10 が create / rename / archive を試行 -> ロック待機後の再認可で全拒否。
timeout 60 psql -X -q -d "$DB" -f "$HERE/conc3_s1.sql" >/tmp/conc3_s1.out 2>&1 &
S1=$!
sleep 1
timeout 60 psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/conc3_s2a.sql" >/tmp/conc3_s2a.out 2>&1 &
P2A=$!
timeout 60 psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/conc3_s2b.sql" >/tmp/conc3_s2b.out 2>&1 &
P2B=$!
timeout 60 psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/conc3_s2c.sql" >/tmp/conc3_s2c.out 2>&1 &
P2C=$!
set +e
wait "$P2A"; RC_A=$?
wait "$P2B"; RC_B=$?
wait "$P2C"; RC_C=$?
set -e
wait "$S1"
for pair in "SEC-62:$RC_A:/tmp/conc3_s2a.out" "SEC-63:$RC_B:/tmp/conc3_s2b.out" "SEC-64:$RC_C:/tmp/conc3_s2c.out"; do
  ID="${pair%%:*}"; REST="${pair#*:}"; RC="${REST%%:*}"; OUT="${REST#*:}"
  if [ "$RC" -eq 0 ]; then
    echo "TEST FAIL: $ID operation should have been rejected"; cat "$OUT"; exit 1
  fi
  grep -q 'not_authorized' "$OUT" || {
    echo "TEST FAIL: $ID unexpected error:"; cat "$OUT"; exit 1; }
  echo "$ID PASSED (rejected with not_authorized after lock wait)"
done
# SEC-65: 拒否された操作の success=true 監査が存在せず、対象データが不変であること
SEC65=$($PSQL_Q -d "$DB" -t -A -c "
  select case
    when exists (select 1 from public.organizations
                  where name like 'SEC-62%' or name like 'SEC-63%') then 'org_mutated'
    when (select name from public.organizations where id = test.id('org_a'))
         <> 'Fictional Org A (test only)' then 'org_a_renamed'
    when (select archived_at from public.organizations where id = test.id('org_a'))
         is not null then 'org_a_archived'
    when exists (select 1 from public.authoritative_audit_logs
                  where actor_user_id = '00000000-0000-4000-8000-00000000000a'
                    and action in ('organization.create','organization.rename','organization.archive')
                    and success = true) then 'forged_success_audit'
    else 'ok' end")
[ "$SEC65" = "ok" ] || { echo "TEST FAIL: SEC-65 state check = $SEC65"; exit 1; }
echo "SEC-65 PASSED (no success audit, no data mutation from rejected ops)"

echo "== CONC-04 / SEC-76..80,82 (org membership ops vs system-admin revoke race) =="
# s1 が U11 の SYSTEM_ADMIN を revoke（グローバルロック保持）。
# その間に U11 が invite / role change / suspend / end を試行。
# 全操作は global -> org のロック順で待機し、再認可で not_authorized 拒否される。
# SEC-82: timeout(45s) と lock_timeout(20s) により、デッドロック・無期限待機を PASS 扱いにしない。
timeout 45 psql -X -q -d "$DB" -f "$HERE/conc4_s1.sql" >/tmp/conc4_s1.out 2>&1 &
S1=$!
sleep 1
timeout 45 psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/conc4_s2a.sql" >/tmp/conc4_s2a.out 2>&1 &
P2A=$!
timeout 45 psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/conc4_s2b.sql" >/tmp/conc4_s2b.out 2>&1 &
P2B=$!
timeout 45 psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/conc4_s2c.sql" >/tmp/conc4_s2c.out 2>&1 &
P2C=$!
timeout 45 psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/conc4_s2d.sql" >/tmp/conc4_s2d.out 2>&1 &
P2D=$!
set +e
wait "$P2A"; RC_A=$?
wait "$P2B"; RC_B=$?
wait "$P2C"; RC_C=$?
wait "$P2D"; RC_D=$?
wait "$S1"; RC_S1=$?
set -e
[ "$RC_S1" -eq 0 ] || { echo "TEST FAIL: CONC-04 s1 revoke failed/timed out (rc=$RC_S1)"; cat /tmp/conc4_s1.out; exit 1; }
for pair in "SEC-76:$RC_A:/tmp/conc4_s2a.out" "SEC-77:$RC_B:/tmp/conc4_s2b.out" \
            "SEC-78:$RC_C:/tmp/conc4_s2c.out" "SEC-79:$RC_D:/tmp/conc4_s2d.out"; do
  ID="${pair%%:*}"; REST="${pair#*:}"; RC="${REST%%:*}"; OUT="${REST#*:}"
  if [ "$RC" -eq 124 ]; then
    echo "TEST FAIL: $ID timed out (possible deadlock / unbounded wait)"; cat "$OUT"; exit 1
  fi
  if [ "$RC" -eq 0 ]; then
    echo "TEST FAIL: $ID operation should have been rejected"; cat "$OUT"; exit 1
  fi
  if grep -Eq 'lock timeout|deadlock' "$OUT"; then
    echo "TEST FAIL: $ID hit lock_timeout/deadlock instead of re-authorization"; cat "$OUT"; exit 1
  fi
  grep -q 'not_authorized' "$OUT" || {
    echo "TEST FAIL: $ID unexpected error:"; cat "$OUT"; exit 1; }
  echo "$ID PASSED (rejected with not_authorized after lock wait)"
done
# SEC-80: 拒否操作の success=true 監査が無く、対象 membership が不変であること
SEC80=$($PSQL_Q -d "$DB" -t -A -c "
  select case
    when exists (select 1 from public.authoritative_audit_logs
                  where actor_user_id = '00000000-0000-4000-8000-00000000000b'
                    and action in ('membership.invite','membership.change_role',
                                   'membership.suspend','membership.end')
                    and success = true) then 'forged_success_audit'
    when (select status || ':' || role from public.organization_memberships
           where id = test.id('m_s1')) <> 'active:SALES_USER' then 'm_s1_mutated'
    when (select status from public.organization_memberships
           where id = test.id('m_a2')) <> 'active' then 'm_a2_mutated'
    when (select status from public.organization_memberships
           where id = test.id('m_invitee')) <> 'invited' then 'm_invitee_mutated'
    else 'ok' end")
[ "$SEC80" = "ok" ] || { echo "TEST FAIL: SEC-80 state check = $SEC80"; exit 1; }
echo "SEC-80 PASSED (no success audit, no membership mutation from rejected ops)"
echo "SEC-82 PASSED (all CONC-04 sessions finished within timeout, no deadlock)"

echo "== CONC-01 (org last-admin race) =="
timeout 60 psql -X -q -d "$DB" -f "$HERE/conc1_s1.sql" >/tmp/conc1_s1.out 2>&1 &
S1=$!
sleep 1
set +e
timeout 60 psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/conc1_s2.sql" >/tmp/conc1_s2.out 2>&1
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
timeout 60 psql -X -q -d "$DB" -f "$HERE/conc2_s1.sql" >/tmp/conc2_s1.out 2>&1 &
S1=$!
sleep 1
set +e
timeout 60 psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/conc2_s2.sql" >/tmp/conc2_s2.out 2>&1
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

echo "== 40 Phase 2A-1 customer-case tests =="
$PSQL -d "$DB" -f "$HERE/40_phase2a_customer_cases.sql"

echo "== 50 Phase 2A-2a profile / invitee tests =="
$PSQL -d "$DB" -f "$HERE/50_phase2a2_profile.sql"

echo "== 60 Phase 2A-2b partner-loan tests =="
$PSQL -d "$DB" -f "$HERE/60_phase2b_partner_loans.sql"

echo "== 70 Phase 2A-3a employment/income tests =="
$PSQL -d "$DB" -f "$HERE/70_phase2a3a_employment_income.sql"

echo "== 80 Phase 2A-W1 branding tests =="
$PSQL -d "$DB" -f "$HERE/80_phase2aw1_branding.sql"

echo ""
echo "==================================================="
echo " PG HARNESS: ALL TESTS PASSED"
echo " (real Supabase / PostgREST / GoTrue / Mailpit"
echo "  validation is still SUPABASE_PENDING)"
echo "==================================================="
