-- ============================================================================
-- 10_fixtures.sql — 架空フィクスチャ
-- FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
-- 実在の個人・法人・金融機関とは無関係の架空データのみ。
-- ============================================================================
\set ON_ERROR_STOP on

-- 架空ユーザー（auth.users への insert でプロフィール自動作成をトリガー）
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000002', 'admin.a.fictional@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'sales.a.fictional@example.test'),
  ('00000000-0000-4000-8000-000000000004', 'admin.b.fictional@example.test'),
  ('00000000-0000-4000-8000-000000000005', 'invitee.fictional@example.test'),
  ('00000000-0000-4000-8000-000000000006', 'admin.a2.fictional@example.test'),
  ('00000000-0000-4000-8000-000000000007', 'sysadmin2.fictional@example.test'),
  ('00000000-0000-4000-8000-000000000008', 'admin.c1.fictional@example.test'),
  ('00000000-0000-4000-8000-000000000009', 'admin.c2.fictional@example.test'),
  ('00000000-0000-4000-8000-00000000000a', 'sysadmin3.fictional@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'sysadmin4.fictional@example.test')
on conflict (id) do nothing;

do $$
declare
  c_sys  constant uuid := '00000000-0000-4000-8000-000000000001';
  c_a1   constant uuid := '00000000-0000-4000-8000-000000000002';
  c_s1   constant uuid := '00000000-0000-4000-8000-000000000003';
  c_b1   constant uuid := '00000000-0000-4000-8000-000000000004';
  c_inv  constant uuid := '00000000-0000-4000-8000-000000000005';
  c_a2   constant uuid := '00000000-0000-4000-8000-000000000006';
  c_sys2 constant uuid := '00000000-0000-4000-8000-000000000007';
  c_c1   constant uuid := '00000000-0000-4000-8000-000000000008';
  c_c2   constant uuid := '00000000-0000-4000-8000-000000000009';
  v_org_a uuid; v_org_b uuid; v_org_c uuid;
  v_m uuid;
begin
  -- SYSTEM_ADMIN として法人作成
  perform test.as_user(c_sys);
  v_org_a := public.app_create_organization('Fictional Org A (test only)');
  v_org_b := public.app_create_organization('Fictional Org B (test only)');
  v_org_c := public.app_create_organization('Fictional Org C (test only)');

  -- OrgA: 初代管理者 U2 を招待
  v_m := public.app_invite_organization_member(v_org_a, 'admin.a.fictional@example.test', 'ORGANIZATION_ADMIN');
  perform test.as_user(c_a1);
  perform public.app_accept_invitation(v_m);

  -- OrgA: U2 が U3 (SALES) / U6 (ADMIN2) を招待、各自受諾
  v_m := public.app_invite_organization_member(v_org_a, 'sales.a.fictional@example.test', 'SALES_USER');
  perform test.as_user(c_s1);
  perform public.app_accept_invitation(v_m);

  perform test.as_user(c_a1);
  v_m := public.app_invite_organization_member(v_org_a, 'admin.a2.fictional@example.test', 'ORGANIZATION_ADMIN');
  perform test.as_user(c_a2);
  perform public.app_accept_invitation(v_m);

  -- OrgA: U5 を招待（invited のまま）
  perform test.as_user(c_a1);
  v_m := public.app_invite_organization_member(v_org_a, 'invitee.fictional@example.test', 'SALES_USER');
  perform test.reset();
  insert into test.ids values ('m_invitee', v_m);

  -- OrgB: U4 管理者
  perform test.as_user(c_sys);
  v_m := public.app_invite_organization_member(v_org_b, 'admin.b.fictional@example.test', 'ORGANIZATION_ADMIN');
  perform test.as_user(c_b1);
  perform public.app_accept_invitation(v_m);

  -- OrgC: U8/U9 管理者（並行テスト用）
  perform test.as_user(c_sys);
  v_m := public.app_invite_organization_member(v_org_c, 'admin.c1.fictional@example.test', 'ORGANIZATION_ADMIN');
  perform test.as_user(c_c1);
  perform public.app_accept_invitation(v_m);
  perform test.as_user(c_sys);
  v_m := public.app_invite_organization_member(v_org_c, 'admin.c2.fictional@example.test', 'ORGANIZATION_ADMIN');
  perform test.as_user(c_c2);
  perform public.app_accept_invitation(v_m);

  -- 2..4人目の SYSTEM_ADMIN（3人目=CONC-03/SEC-62..65、4人目=CONC-04/SEC-76..80 用）
  perform test.as_user(c_sys);
  perform public.app_grant_system_admin(c_sys2);
  perform public.app_grant_system_admin('00000000-0000-4000-8000-00000000000a');
  perform public.app_grant_system_admin('00000000-0000-4000-8000-00000000000b');

  perform test.reset();
  insert into test.ids values
    ('org_a', v_org_a), ('org_b', v_org_b), ('org_c', v_org_c);
  insert into test.ids
    select 'm_a1', id from public.organization_memberships
     where organization_id = v_org_a and user_id = c_a1;
  insert into test.ids
    select 'm_s1', id from public.organization_memberships
     where organization_id = v_org_a and user_id = c_s1;
  insert into test.ids
    select 'm_a2', id from public.organization_memberships
     where organization_id = v_org_a and user_id = c_a2;
  insert into test.ids
    select 'm_b1', id from public.organization_memberships
     where organization_id = v_org_b and user_id = c_b1;
  insert into test.ids
    select 'm_c1', id from public.organization_memberships
     where organization_id = v_org_c and user_id = c_c1;
  insert into test.ids
    select 'm_c2', id from public.organization_memberships
     where organization_id = v_org_c and user_id = c_c2;
end
$$;

-- 検証: フィクスチャ成立
do $$
begin
  if (select count(*) from public.organizations) <> 3 then
    raise exception 'FIXTURE FAIL: organizations count';
  end if;
  if (select count(*) from public.organization_memberships where status = 'active') <> 6 then
    raise exception 'FIXTURE FAIL: active memberships count, got %',
      (select count(*) from public.organization_memberships where status = 'active');
  end if;
  if (select count(*) from public.user_profiles where system_role = 'SYSTEM_ADMIN') <> 4 then
    raise exception 'FIXTURE FAIL: system admin count';
  end if;
end
$$;
