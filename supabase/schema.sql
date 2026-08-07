-- =====================================================================
-- ตาราง สิทธิ์การเข้าถึง และที่เก็บไฟล์ ของการ์ดงานแต่ง
-- วิธีใช้: เปิด Supabase > SQL Editor > New query > วางทั้งไฟล์นี้ > Run
-- รันซ้ำได้ ไม่พังของเดิม
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. คำตอบรับคำเชิญ
-- ---------------------------------------------------------------------
create table if not exists public.rsvps (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text        not null check (char_length(btrim(name)) between 1 and 120),
  attending  boolean     not null,
  guests     smallint    not null default 1 check (guests between 0 and 20),
  note       text        check (note is null or char_length(note) <= 500)
);

create index if not exists rsvps_created_at_idx on public.rsvps (created_at desc);

-- ---------------------------------------------------------------------
-- 2. เช็คอินหน้างาน (แขกสแกน QR แล้วกดเช็คอิน)
-- ---------------------------------------------------------------------
create table if not exists public.checkins (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text        not null check (char_length(btrim(name)) between 1 and 120),
  party_size smallint    not null default 1 check (party_size between 1 and 20)
);

create index if not exists checkins_created_at_idx on public.checkins (created_at desc);

-- ---------------------------------------------------------------------
-- 3. คำอวยพร (ข้อความ / การ์ดรูปภาพ / คลิปวิดีโอ)
-- ---------------------------------------------------------------------
create table if not exists public.wishes (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text        not null check (char_length(btrim(name)) between 1 and 120),
  kind       text        not null check (kind in ('text', 'photo', 'video')),
  message    text        check (message is null or char_length(message) <= 1000),
  media_path text        check (media_path is null or char_length(media_path) <= 300)
);

create index if not exists wishes_created_at_idx on public.wishes (created_at desc);

-- ---------------------------------------------------------------------
-- 4. สิทธิ์การเข้าถึงตาราง
--    เปิด Row Level Security: ถ้าไม่มี policy ครอบ = ทำอะไรไม่ได้เลย
--    แขก (anon key ที่ฝังในหน้าเว็บ) เพิ่มข้อมูลได้อย่างเดียว อ่านไม่ได้
--    เจ้าภาพ (ล็อกอินแล้ว) อ่านและลบได้
-- ---------------------------------------------------------------------
alter table public.rsvps    enable row level security;
alter table public.checkins enable row level security;
alter table public.wishes   enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['rsvps', 'checkins', 'wishes'] loop
    execute format('drop policy if exists "guests can insert" on public.%I', t);
    execute format('create policy "guests can insert" on public.%I
                      for insert to anon with check (true)', t);

    execute format('drop policy if exists "hosts can read" on public.%I', t);
    execute format('create policy "hosts can read" on public.%I
                      for select to authenticated using (true)', t);

    execute format('drop policy if exists "hosts can delete" on public.%I', t);
    execute format('create policy "hosts can delete" on public.%I
                      for delete to authenticated using (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. ที่เก็บไฟล์รูปและคลิปอวยพร
--    bucket แบบไม่เปิดสาธารณะ เจ้าภาพเปิดดูผ่านลิงก์ที่มีอายุจำกัดเท่านั้น
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('wishes', 'wishes', false, 52428800)   -- 50 MB ต่อไฟล์
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "guests can upload wish media" on storage.objects;
create policy "guests can upload wish media"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'wishes');

drop policy if exists "hosts can read wish media" on storage.objects;
create policy "hosts can read wish media"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'wishes');

drop policy if exists "hosts can delete wish media" on storage.objects;
create policy "hosts can delete wish media"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'wishes');
