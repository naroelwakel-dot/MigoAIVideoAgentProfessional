-- ============================================================================
-- Migo AI Video Agent Professional - database/policies.sql
-- شغّله بعد schema.sql. يفعّل RLS على كل جدول ويمنع أي وصول بين المستخدمين.
-- القاعدة: كل صف يخص مالكه فقط (auth.uid() = owner_id).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- تفعيل RLS على كل الجداول
-- ----------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.video_projects     enable row level security;
alter table public.project_scenes     enable row level security;
alter table public.reference_assets   enable row level security;
alter table public.source_registry    enable row level security;
alter table public.knowledge_items    enable row level security;
alter table public.project_feedback   enable row level security;
alter table public.learning_proposals enable row level security;
alter table public.learning_decisions enable row level security;
alter table public.video_analyses     enable row level security;
alter table public.prompt_versions    enable row level security;

-- ----------------------------------------------------------------------------
-- profiles: المستخدم يرى ويعدّل ملفه فقط
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- دالة مساعدة: توليد سياسات CRUD كاملة لجداول المالك
-- (نصّية هنا لتوضيح كل جدول بدل حلقات معقدة، فالشفافية أهم من الاختصار)
-- ----------------------------------------------------------------------------

-- video_projects
drop policy if exists vp_select on public.video_projects;
create policy vp_select on public.video_projects for select using (owner_id = auth.uid());
drop policy if exists vp_insert on public.video_projects;
create policy vp_insert on public.video_projects for insert with check (owner_id = auth.uid());
drop policy if exists vp_update on public.video_projects;
create policy vp_update on public.video_projects for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists vp_delete on public.video_projects;
create policy vp_delete on public.video_projects for delete using (owner_id = auth.uid());

-- project_scenes
drop policy if exists ps_select on public.project_scenes;
create policy ps_select on public.project_scenes for select using (owner_id = auth.uid());
drop policy if exists ps_insert on public.project_scenes;
create policy ps_insert on public.project_scenes for insert with check (owner_id = auth.uid());
drop policy if exists ps_update on public.project_scenes;
create policy ps_update on public.project_scenes for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists ps_delete on public.project_scenes;
create policy ps_delete on public.project_scenes for delete using (owner_id = auth.uid());

-- reference_assets
drop policy if exists ra_select on public.reference_assets;
create policy ra_select on public.reference_assets for select using (owner_id = auth.uid());
drop policy if exists ra_insert on public.reference_assets;
create policy ra_insert on public.reference_assets for insert with check (owner_id = auth.uid());
drop policy if exists ra_update on public.reference_assets;
create policy ra_update on public.reference_assets for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists ra_delete on public.reference_assets;
create policy ra_delete on public.reference_assets for delete using (owner_id = auth.uid());

-- source_registry
drop policy if exists sr_select on public.source_registry;
create policy sr_select on public.source_registry for select using (owner_id = auth.uid());
drop policy if exists sr_insert on public.source_registry;
create policy sr_insert on public.source_registry for insert with check (owner_id = auth.uid());
drop policy if exists sr_update on public.source_registry;
create policy sr_update on public.source_registry for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists sr_delete on public.source_registry;
create policy sr_delete on public.source_registry for delete using (owner_id = auth.uid());

-- knowledge_items
drop policy if exists ki_select on public.knowledge_items;
create policy ki_select on public.knowledge_items for select using (owner_id = auth.uid());
drop policy if exists ki_insert on public.knowledge_items;
create policy ki_insert on public.knowledge_items for insert with check (owner_id = auth.uid());
drop policy if exists ki_update on public.knowledge_items;
create policy ki_update on public.knowledge_items for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists ki_delete on public.knowledge_items;
create policy ki_delete on public.knowledge_items for delete using (owner_id = auth.uid());

-- project_feedback
drop policy if exists pf_select on public.project_feedback;
create policy pf_select on public.project_feedback for select using (owner_id = auth.uid());
drop policy if exists pf_insert on public.project_feedback;
create policy pf_insert on public.project_feedback for insert with check (owner_id = auth.uid());
drop policy if exists pf_update on public.project_feedback;
create policy pf_update on public.project_feedback for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists pf_delete on public.project_feedback;
create policy pf_delete on public.project_feedback for delete using (owner_id = auth.uid());

-- learning_proposals
drop policy if exists lp_select on public.learning_proposals;
create policy lp_select on public.learning_proposals for select using (owner_id = auth.uid());
drop policy if exists lp_insert on public.learning_proposals;
create policy lp_insert on public.learning_proposals for insert with check (owner_id = auth.uid());
drop policy if exists lp_update on public.learning_proposals;
create policy lp_update on public.learning_proposals for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists lp_delete on public.learning_proposals;
create policy lp_delete on public.learning_proposals for delete using (owner_id = auth.uid());

-- learning_decisions (سجل تاريخي: لا تعديل ولا حذف بعد الإنشاء)
drop policy if exists ld_select on public.learning_decisions;
create policy ld_select on public.learning_decisions for select using (owner_id = auth.uid());
drop policy if exists ld_insert on public.learning_decisions;
create policy ld_insert on public.learning_decisions for insert with check (owner_id = auth.uid());

-- video_analyses
drop policy if exists va_select on public.video_analyses;
create policy va_select on public.video_analyses for select using (owner_id = auth.uid());
drop policy if exists va_insert on public.video_analyses;
create policy va_insert on public.video_analyses for insert with check (owner_id = auth.uid());
drop policy if exists va_update on public.video_analyses;
create policy va_update on public.video_analyses for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists va_delete on public.video_analyses;
create policy va_delete on public.video_analyses for delete using (owner_id = auth.uid());

-- prompt_versions
drop policy if exists pv_select on public.prompt_versions;
create policy pv_select on public.prompt_versions for select using (owner_id = auth.uid());
drop policy if exists pv_insert on public.prompt_versions;
create policy pv_insert on public.prompt_versions for insert with check (owner_id = auth.uid());
drop policy if exists pv_update on public.prompt_versions;
create policy pv_update on public.prompt_versions for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists pv_delete on public.prompt_versions;
create policy pv_delete on public.prompt_versions for delete using (owner_id = auth.uid());

-- ============================================================================
-- Storage: buckets خاصة. المسار يبدأ بمعرّف المستخدم: <uid>/...
-- لا يصبح أي ملف عاماً.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('reference-assets', 'reference-assets', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('outputs', 'outputs', false)
on conflict (id) do nothing;

-- reference-assets: كل عملية مشروطة بأن أول مجلد في المسار = uid المستخدم
drop policy if exists ra_store_select on storage.objects;
create policy ra_store_select on storage.objects for select
  using (bucket_id = 'reference-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists ra_store_insert on storage.objects;
create policy ra_store_insert on storage.objects for insert
  with check (bucket_id = 'reference-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists ra_store_update on storage.objects;
create policy ra_store_update on storage.objects for update
  using (bucket_id = 'reference-assets' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists ra_store_delete on storage.objects;
create policy ra_store_delete on storage.objects for delete
  using (bucket_id = 'reference-assets' and (storage.foldername(name))[1] = auth.uid()::text);

-- outputs: نفس القاعدة
drop policy if exists out_store_select on storage.objects;
create policy out_store_select on storage.objects for select
  using (bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists out_store_insert on storage.objects;
create policy out_store_insert on storage.objects for insert
  with check (bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists out_store_update on storage.objects;
create policy out_store_update on storage.objects for update
  using (bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists out_store_delete on storage.objects;
create policy out_store_delete on storage.objects for delete
  using (bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text);
