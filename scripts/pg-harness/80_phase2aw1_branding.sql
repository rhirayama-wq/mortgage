-- ============================================================================
-- 80_phase2aw1_branding.sql — Phase 2A-W1（法人別ブランディング基盤）の
--   RLS・業務関数・テナント分離・Storage policy・監査テスト (PG_HARNESS)
-- FICTIONAL / TEST ONLY / PRODUCTION USE PROHIBITED
-- 依存: 0001–0006 migration、00_shim(storage 擬似スキーマ)、10_fixtures(org_a/org_b, admin/sales)。
-- 40/50/60/70 の後に実行。既存 membership を変更しない（新規 org branding/customer のみ）。
-- ============================================================================
\set ON_ERROR_STOP on

-- 架空の顧客（case participant 用）
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000ab01', 'cust.w1.a@example.test'),
  ('00000000-0000-4000-8000-00000000ab02', 'cust.w1.b@example.test')
on conflict (id) do nothing;

-- 架空の suspended ORG_ADMIN（org_a・非 active）: 権限テスト用
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000ab03', 'suspended.admin.w1@example.test')
on conflict (id) do nothing;

-- ---- セットアップ: org_a の案件に顧客 ab01 を参加させる + suspended admin を用意 ----
do $$
declare
  c_s1  constant uuid := '00000000-0000-4000-8000-000000000003'; -- org_a sales (assigned)
  c_cp  constant uuid := '00000000-0000-4000-8000-00000000ab01'; -- customer (participant)
  v_case uuid; v_inv uuid; v_sys uuid;
begin
  perform test.as_user(c_s1);
  v_case := public.app_create_customer_case(test.id('org_a'), test.id('m_s1'),
              'W1 Branding Case (test only)');
  v_inv := public.app_invite_case_applicant(v_case, 'primary', 'cust.w1.a@example.test');
  perform test.as_user(c_cp);
  perform public.app_accept_case_invitation(v_inv);

  perform test.reset();
  -- suspended ORG_ADMIN membership を直接投入（owner は RLS bypass）。
  insert into public.organization_memberships (organization_id, user_id, role, status, invited_email)
  values (test.id('org_a'), '00000000-0000-4000-8000-00000000ab03', 'ORGANIZATION_ADMIN', 'suspended',
          'suspended.admin.w1@example.test')
  on conflict do nothing;

  select id into v_sys from public.user_profiles where system_role = 'SYSTEM_ADMIN' limit 1;
  if v_sys is null then raise exception 'FIXTURE FAIL: W1 no SYSTEM_ADMIN'; end if;

  insert into test.ids values ('w1_case_a', v_case), ('w1_sys', v_sys);
end
$$;

-- W1-01: ORG_ADMIN が表示名・色を保存（created 監査・行に値）
do $$
declare v_ts timestamptz; v_name text; v_color text; v_audit int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  v_ts := public.app_update_organization_branding(
    test.id('org_a'), '架空不動産株式会社', '#2563eb', null, null);
  if v_ts is null then raise exception 'TEST FAIL: W1-01 no updated_at'; end if;
  perform test.reset();
  select display_name, primary_color_hex into v_name, v_color
    from public.organization_branding where organization_id = test.id('org_a');
  if v_name <> '架空不動産株式会社' or v_color <> '#2563eb' then
    raise exception 'TEST FAIL: W1-01 values not saved: % %', v_name, v_color;
  end if;
  select count(*) into v_audit from public.authoritative_audit_logs
   where action = 'organization_branding.created'
     and resource_id = test.id('org_a')::text and success;
  if v_audit <> 1 then raise exception 'TEST FAIL: W1-01 created audit %', v_audit; end if;
end
$$;

-- W1-02: 色更新（updated 監査）
do $$
declare v_audit int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  perform public.app_update_organization_branding(test.id('org_a'), '架空不動産株式会社', '#16a34a', null, null);
  perform test.reset();
  select count(*) into v_audit from public.authoritative_audit_logs
   where action = 'organization_branding.updated'
     and resource_id = test.id('org_a')::text and success;
  if v_audit < 1 then raise exception 'TEST FAIL: W1-02 updated audit %', v_audit; end if;
end
$$;

-- W1-03: ロゴ path 登録（logo_uploaded 監査・path 保存）
do $$
declare v_path text; v_saved text;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  v_path := test.id('org_a')::text || '/' || gen_random_uuid()::text || '.png';
  perform public.app_set_organization_branding_logo(test.id('org_a'), v_path, null, null);
  perform test.reset();
  select logo_storage_path into v_saved from public.organization_branding where organization_id = test.id('org_a');
  if v_saved <> v_path then raise exception 'TEST FAIL: W1-03 logo path not saved'; end if;
  if not exists (select 1 from public.authoritative_audit_logs
                  where action='organization_branding.logo_uploaded'
                    and resource_id=test.id('org_a')::text and success) then
    raise exception 'TEST FAIL: W1-03 no logo_uploaded audit';
  end if;
end
$$;

-- W1-15: 顧客(participant)は自 case の org 公開ブランドを取得（3項目）
do $$
declare r record; v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-00000000ab01');
  select * into r from public.app_get_customer_case_public_branding(test.id('w1_case_a'));
  if r.display_name <> '架空不動産株式会社' or r.primary_color_hex <> '#16a34a' then
    raise exception 'TEST FAIL: W1-15 public branding wrong: % %', r.display_name, r.primary_color_hex;
  end if;
  if r.logo_storage_path is null then raise exception 'TEST FAIL: W1-15 logo path missing'; end if;
  -- 値テーブルの直接 SELECT は顧客に許可しない（内部列は取得不可）。
  select count(*) into v_n from public.organization_branding where organization_id = test.id('org_a');
  if v_n <> 0 then raise exception 'TEST FAIL: W1-15 customer SELECTed branding table %', v_n; end if;
end
$$;

-- W1-17: 顧客は participant でない case の公開ブランドを取得できない（0 件）
do $$
declare v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-00000000ab02'); -- 非 participant
  select count(*) into v_n from public.app_get_customer_case_public_branding(test.id('w1_case_a'));
  if v_n <> 0 then raise exception 'TEST FAIL: W1-17 non-participant got branding %', v_n; end if;
end
$$;

-- W1-10: SALES_USER は更新不可（not_authorized）+ 適用済みブランドは SELECT 可
do $$
declare v_fail boolean := false; v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003'); -- org_a sales
  begin
    perform public.app_update_organization_branding(test.id('org_a'), 'hack', '#000000', null, null);
  exception when others then
    if position('not_authorized' in sqlerrm)=0 then raise; end if; v_fail := true;
  end;
  if not v_fail then raise exception 'TEST FAIL: W1-10 sales updated branding'; end if;
  select count(*) into v_n from public.organization_branding where organization_id = test.id('org_a');
  if v_n <> 1 then raise exception 'TEST FAIL: W1-10 sales cannot read applied branding %', v_n; end if;
end
$$;

-- W1-11: customer は更新不可（not_authorized）
do $$
declare v_fail boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-00000000ab01');
  begin
    perform public.app_update_organization_branding(test.id('org_a'), 'hack', '#000000', null, null);
  exception when others then
    if position('not_authorized' in sqlerrm)=0 then raise; end if; v_fail := true;
  end;
  if not v_fail then raise exception 'TEST FAIL: W1-11 customer updated branding'; end if;
end
$$;

-- W1-12: SYSTEM_ADMIN は更新不可 + 値テーブル不可視
do $$
declare v_fail boolean := false; v_n int;
begin
  perform test.as_user(test.id('w1_sys'));
  begin
    perform public.app_update_organization_branding(test.id('org_a'), 'hack', '#000000', null, null);
  exception when others then
    if position('not_authorized' in sqlerrm)=0 then raise; end if; v_fail := true;
  end;
  if not v_fail then raise exception 'TEST FAIL: W1-12 system admin updated branding'; end if;
  select count(*) into v_n from public.organization_branding where organization_id = test.id('org_a');
  if v_n <> 0 then raise exception 'TEST FAIL: W1-12 system admin SELECTed branding %', v_n; end if;
end
$$;

-- W1-13: 他 organization admin は更新不可 + 不可視
do $$
declare v_fail boolean := false; v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000004'); -- org_b admin
  begin
    perform public.app_update_organization_branding(test.id('org_a'), 'hack', '#000000', null, null);
  exception when others then
    if position('not_authorized' in sqlerrm)=0 then raise; end if; v_fail := true;
  end;
  if not v_fail then raise exception 'TEST FAIL: W1-13 cross-org updated branding'; end if;
  select count(*) into v_n from public.organization_branding where organization_id = test.id('org_a');
  if v_n <> 0 then raise exception 'TEST FAIL: W1-13 cross-org SELECTed branding %', v_n; end if;
end
$$;

-- W1-14: suspended ORG_ADMIN は更新不可
do $$
declare v_fail boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-00000000ab03');
  begin
    perform public.app_update_organization_branding(test.id('org_a'), 'hack', '#000000', null, null);
  exception when others then
    if position('not_authorized' in sqlerrm)=0 then raise; end if; v_fail := true;
  end;
  if not v_fail then raise exception 'TEST FAIL: W1-14 suspended admin updated branding'; end if;
end
$$;

-- W1-07: 不正入力を拒否（色・表示名長さ・logo path）
do $$
declare e1 boolean:=false; e2 boolean:=false; e3 boolean:=false; e4 boolean:=false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  begin perform public.app_update_organization_branding(test.id('org_a'), null, 'red', null, null);
  exception when others then if position('invalid_branding_color' in sqlerrm)=0 then raise; end if; e1:=true; end;
  begin perform public.app_update_organization_branding(test.id('org_a'), null, 'rgb(0,0,0)', null, null);
  exception when others then if position('invalid_branding_color' in sqlerrm)=0 then raise; end if; e2:=true; end;
  begin perform public.app_update_organization_branding(test.id('org_a'), repeat('あ',101), null, null, null);
  exception when others then if position('invalid_branding_display_name' in sqlerrm)=0 then raise; end if; e3:=true; end;
  begin perform public.app_set_organization_branding_logo(test.id('org_a'),
          test.id('org_b')::text || '/' || gen_random_uuid()::text || '.png', null, null);
  exception when others then if position('invalid_branding_logo_path' in sqlerrm)=0 then raise; end if; e4:=true; end;
  if not (e1 and e2 and e3 and e4) then
    raise exception 'TEST FAIL: W1-07 invalid inputs accepted (%,%,%,%)', e1,e2,e3,e4;
  end if;
end
$$;

-- W1-07b: SVG 拡張子・traversal を含む logo path を拒否
do $$
declare e5 boolean:=false; e6 boolean:=false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  begin perform public.app_set_organization_branding_logo(test.id('org_a'),
          test.id('org_a')::text || '/' || gen_random_uuid()::text || '.svg', null, null);
  exception when others then if position('invalid_branding_logo_path' in sqlerrm)=0 then raise; end if; e5:=true; end;
  begin perform public.app_set_organization_branding_logo(test.id('org_a'),
          test.id('org_a')::text || '/../secret.png', null, null);
  exception when others then if position('invalid_branding_logo_path' in sqlerrm)=0 then raise; end if; e6:=true; end;
  if not (e5 and e6) then raise exception 'TEST FAIL: W1-07b svg/traversal path accepted (%,%)', e5, e6; end if;
end
$$;

-- W1-04: 楽観ロック（stale expected_updated_at を拒否）
do $$
declare v_fail boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  begin
    perform public.app_update_organization_branding(
      test.id('org_a'), '架空不動産株式会社', '#2563eb',
      timestamptz '2000-01-01 00:00:00+00', null);
  exception when others then
    if position('branding_stale_update' in sqlerrm)=0 then raise; end if; v_fail := true;
  end;
  if not v_fail then raise exception 'TEST FAIL: W1-04 stale update accepted'; end if;
end
$$;

-- W1-18: 直接 INSERT/UPDATE/DELETE 拒否（本人 admin でも DML 権限なし・DELETE ガード）
do $$
declare v_ok int := 0;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  begin
    insert into public.organization_branding (organization_id, display_name)
      values (test.id('org_b'), 'hack');
  exception when insufficient_privilege then v_ok:=v_ok+1; when others then v_ok:=v_ok+1; end;
  begin
    update public.organization_branding set display_name='hack' where organization_id=test.id('org_a');
  exception when insufficient_privilege then v_ok:=v_ok+1; end;
  begin
    delete from public.organization_branding where organization_id=test.id('org_a');
  exception when insufficient_privilege then v_ok:=v_ok+1; end;
  if v_ok <> 3 then raise exception 'TEST FAIL: W1-18 direct DML not blocked %/3', v_ok; end if;
end
$$;

-- W1-16: 監査に画像/URL/token/PII が入らない（logo_changed / field 名のみ）
do $$
declare v_leak int;
begin
  perform test.reset();
  select count(*) into v_leak from public.authoritative_audit_logs
   where resource_type = 'organization_branding'
     and (metadata::text ilike '%storage/v1/object%'
          or metadata::text ilike '%data:image%'
          or metadata::text ~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)/');
  if v_leak <> 0 then raise exception 'TEST FAIL: W1-16 audit leaked url/path/binary %', v_leak; end if;
end
$$;

-- ---- Storage policy（storage.objects RLS・shim スキーマ上）----
-- W1-20: ORG_ADMIN は自 org フォルダへ INSERT 可
do $$
declare v_n int;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  insert into storage.objects (bucket_id, name, owner)
    values ('org-branding', test.id('org_a')::text || '/' || gen_random_uuid()::text || '.png', auth.uid());
  perform test.reset();
  select count(*) into v_n from storage.objects
   where bucket_id='org-branding' and (storage.foldername(name))[1] = test.id('org_a')::text;
  if v_n < 1 then raise exception 'TEST FAIL: W1-20 admin cannot upload own-folder %', v_n; end if;
end
$$;

-- W1-21: ORG_ADMIN は他 org フォルダへ INSERT 不可
do $$
declare v_fail boolean := false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002'); -- org_a admin
  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('org-branding', test.id('org_b')::text || '/' || gen_random_uuid()::text || '.png', auth.uid());
  exception when insufficient_privilege then v_fail := true; end;
  if not v_fail then raise exception 'TEST FAIL: W1-21 admin uploaded to other org folder'; end if;
end
$$;

-- W1-22: SALES / customer / SYSTEM_ADMIN は INSERT 不可
do $$
declare f1 boolean:=false; f2 boolean:=false; f3 boolean:=false;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000003'); -- sales
  begin insert into storage.objects (bucket_id, name, owner)
    values ('org-branding', test.id('org_a')::text||'/'||gen_random_uuid()::text||'.png', auth.uid());
  exception when insufficient_privilege then f1:=true; end;
  perform test.as_user('00000000-0000-4000-8000-00000000ab01'); -- customer
  begin insert into storage.objects (bucket_id, name, owner)
    values ('org-branding', test.id('org_a')::text||'/'||gen_random_uuid()::text||'.png', auth.uid());
  exception when insufficient_privilege then f2:=true; end;
  perform test.as_user(test.id('w1_sys')); -- system admin
  begin insert into storage.objects (bucket_id, name, owner)
    values ('org-branding', test.id('org_a')::text||'/'||gen_random_uuid()::text||'.png', auth.uid());
  exception when insufficient_privilege then f3:=true; end;
  if not (f1 and f2 and f3) then
    raise exception 'TEST FAIL: W1-22 non-admin uploaded (%,%,%)', f1,f2,f3;
  end if;
end
$$;

-- W1-23: 他 bucket への INSERT は不可（policy は org-branding 限定）
do $$
declare v_fail boolean := false;
begin
  perform test.reset();
  insert into storage.buckets (id, name, public) values ('other-bucket','other-bucket',false) on conflict do nothing;
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  begin
    insert into storage.objects (bucket_id, name, owner)
      values ('other-bucket', test.id('org_a')::text||'/'||gen_random_uuid()::text||'.png', auth.uid());
  exception when insufficient_privilege then v_fail := true; end;
  if not v_fail then raise exception 'TEST FAIL: W1-23 insert into other bucket allowed'; end if;
end
$$;

-- W1-05/06: remove logo -> null、reset -> 3 列 null
do $$
declare v_logo text; v_name text; v_color text;
begin
  perform test.as_user('00000000-0000-4000-8000-000000000002');
  perform public.app_remove_organization_branding_logo(test.id('org_a'), null, null);
  perform test.reset();
  select logo_storage_path into v_logo from public.organization_branding where organization_id=test.id('org_a');
  if v_logo is not null then raise exception 'TEST FAIL: W1-05 logo not nulled'; end if;

  perform test.as_user('00000000-0000-4000-8000-000000000002');
  perform public.app_reset_organization_branding(test.id('org_a'), null);
  perform test.reset();
  select display_name, logo_storage_path, primary_color_hex into v_name, v_logo, v_color
    from public.organization_branding where organization_id=test.id('org_a');
  if v_name is not null or v_logo is not null or v_color is not null then
    raise exception 'TEST FAIL: W1-06 reset did not null overrides';
  end if;
  if not exists (select 1 from public.authoritative_audit_logs
                  where action='organization_branding.reset' and resource_id=test.id('org_a')::text and success) then
    raise exception 'TEST FAIL: W1-06 no reset audit';
  end if;
end
$$;

\echo 'W1: ALL Phase 2A-W1 branding tests passed'
