-- ============================================================================
-- Migo AI Video Agent Professional - database/schema.sql
-- شغّل هذا الملف في Supabase > SQL Editor قبل policies.sql.
-- المستخدم: حساب المالك فقط. لا يوجد تسجيل عام.
-- ملاحظة: كل جدول خاص يحمل owner_id افتراضه auth.uid() لضمان العزل.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- دالة تحديث updated_at تلقائياً
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 1) profiles - ملف المالك
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2) video_projects - المشاريع
-- ----------------------------------------------------------------------------
create table if not exists public.video_projects (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title            text not null,
  idea             text not null,
  objective        text,
  audience         text,
  duration_seconds integer not null check (duration_seconds in (15,30,45,60,90,120)),
  aspect_ratio     text not null check (aspect_ratio in ('9:16','16:9','1:1')),
  visual_style     text,
  treatment        text,
  master_prompt    text,
  plan             jsonb not null default '{}'::jsonb,
  status           text not null default 'draft' check (status in ('draft','ready','filmed','archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3) project_scenes - مشاهد المشروع
-- ----------------------------------------------------------------------------
create table if not exists public.project_scenes (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.video_projects(id) on delete cascade,
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scene_number     integer not null,
  start_seconds    numeric not null,
  end_seconds      numeric not null,
  duration_seconds numeric not null,
  role             text,
  beat             text,
  shot_type        text,
  camera_angle     text,
  camera_movement  text,
  lens             text,
  depth_of_field   text,
  lighting         text,
  color_palette    text,
  audio            text,
  transition       text,
  dialogue         text,
  prompt           text,
  negative_prompt  text,
  continuity_notes text,
  asset_ids        uuid[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (project_id, scene_number)
);

-- ----------------------------------------------------------------------------
-- 4) reference_assets - مكتبة الأصول وثبات الشخصيات
-- ----------------------------------------------------------------------------
create table if not exists public.reference_assets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  asset_key   text not null,           -- معرّف ثابت لإعادة الاستخدام في البرومبتات
  asset_type  text not null check (asset_type in
              ('character','face','clothing','voice','location','prop','palette','reference_image')),
  description text not null,
  attributes  jsonb not null default '{}'::jsonb,
  image_path  text,                    -- مسار في Storage خاص (غير عام)
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, asset_key)
);

-- ----------------------------------------------------------------------------
-- 5) source_registry - سجل المصادر والمراجع
-- ----------------------------------------------------------------------------
create table if not exists public.source_registry (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null,
  url         text,
  accessed_at date not null default current_date,
  summary     text,
  source_type text not null default 'manual' check (source_type in ('web','manual','file','reference_video')),
  reliability text not null default 'unverified' check (reliability in ('verified','unverified','outdated')),
  last_reviewed_at date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6) knowledge_items - قاعدة المعرفة (موثّق / اقتراح / استنتاج)
-- ----------------------------------------------------------------------------
create table if not exists public.knowledge_items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null,
  body        text not null,
  category    text,
  tags        text[] not null default '{}',
  -- يفصل بين المعلومة الموثقة والاقتراح والاستنتاج (متطلب صريح)
  item_type   text not null default 'documented' check (item_type in ('documented','proposal','inference')),
  status      text not null default 'pending' check (status in ('pending','approved','rejected','archived')),
  source_id   uuid references public.source_registry(id) on delete set null,
  project_id  uuid references public.video_projects(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7) project_feedback - تقييمات المستخدم (1..5)
-- ----------------------------------------------------------------------------
create table if not exists public.project_feedback (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id    uuid not null references public.video_projects(id) on delete cascade,
  rating        integer not null check (rating between 1 and 5),
  success_notes text,
  failure_notes text,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8) learning_proposals - اقتراحات التعلم (لا تصبح نشطة قبل الاعتماد)
-- ----------------------------------------------------------------------------
create table if not exists public.learning_proposals (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rule_text        text not null,
  reason           text,
  expected_impact  text,
  source_id        uuid references public.source_registry(id) on delete set null,
  project_id       uuid references public.video_projects(id) on delete set null,
  feedback_id      uuid references public.project_feedback(id) on delete set null,
  previous_rule_id uuid references public.learning_proposals(id) on delete set null,
  status           text not null default 'pending' check (status in ('pending','approved','rejected','archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9) learning_decisions - سجل قرارات الاعتماد/الرفض/التراجع
-- ----------------------------------------------------------------------------
create table if not exists public.learning_decisions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  proposal_id uuid not null references public.learning_proposals(id) on delete cascade,
  decision    text not null check (decision in ('approved','rejected','archived','rolled_back')),
  notes       text,
  decided_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 10) video_analyses - تحليل الفيديو
-- ----------------------------------------------------------------------------
create table if not exists public.video_analyses (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id       uuid references public.video_projects(id) on delete set null,
  file_name        text,
  file_size_bytes  bigint,
  duration_seconds numeric,
  width            integer,
  height           integer,
  frame_rate       numeric,
  timeline         jsonb not null default '[]'::jsonb,  -- إطارات + وصف كل لقطة (يدوي أو بمساعدة نموذج رؤية)
  notes            text,
  report           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 11) prompt_versions - تاريخ نسخ البرومبتات
-- ----------------------------------------------------------------------------
create table if not exists public.prompt_versions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id      uuid not null references public.video_projects(id) on delete cascade,
  scene_id        uuid references public.project_scenes(id) on delete set null,
  version         integer not null default 1,
  prompt          text not null,
  negative_prompt text,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- الفهارس
-- ----------------------------------------------------------------------------
create index if not exists idx_projects_owner          on public.video_projects(owner_id, created_at desc);
create index if not exists idx_scenes_project          on public.project_scenes(project_id, scene_number);
create index if not exists idx_scenes_owner            on public.project_scenes(owner_id);
create index if not exists idx_assets_owner            on public.reference_assets(owner_id, asset_type);
create index if not exists idx_sources_owner           on public.source_registry(owner_id, accessed_at desc);
create index if not exists idx_knowledge_owner_status  on public.knowledge_items(owner_id, status, item_type);
create index if not exists idx_feedback_project        on public.project_feedback(project_id);
create index if not exists idx_proposals_owner_status  on public.learning_proposals(owner_id, status);
create index if not exists idx_decisions_proposal      on public.learning_decisions(proposal_id, decided_at desc);
create index if not exists idx_analyses_owner          on public.video_analyses(owner_id, created_at desc);
create index if not exists idx_prompt_versions_proj    on public.prompt_versions(project_id, scene_id, version desc);

-- ----------------------------------------------------------------------------
-- مشغّلات updated_at
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','video_projects','project_scenes','reference_assets',
                           'source_registry','knowledge_items','learning_proposals','video_analyses']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s;', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s
                    for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- إنشاء ملف شخصي تلقائياً عند إنشاء مستخدم في Supabase Dashboard
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
