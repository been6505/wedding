-- =====================================================================
-- ตารางเก็บคำตอบรับ + สิทธิ์การเข้าถึง
-- วิธีใช้: เปิด Supabase > SQL Editor > New query > วางทั้งไฟล์นี้ > Run
-- =====================================================================

create table if not exists public.rsvps (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text        not null check (char_length(btrim(name)) between 1 and 120),
  attending  boolean     not null,
  guests     smallint    not null default 1 check (guests between 0 and 20),
  note       text        check (note is null or char_length(note) <= 500)
);

create index if not exists rsvps_created_at_idx on public.rsvps (created_at desc);

-- เปิด Row Level Security: ถ้าไม่มี policy ครอบ = ทำอะไรไม่ได้เลย
alter table public.rsvps enable row level security;

-- แขก (anon key ที่ฝังอยู่ในหน้าเว็บ) ส่งคำตอบได้อย่างเดียว
drop policy if exists "guests can submit rsvp" on public.rsvps;
create policy "guests can submit rsvp"
  on public.rsvps
  for insert
  to anon
  with check (true);

-- อ่านรายชื่อได้เฉพาะผู้ที่ล็อกอินแล้ว (เจ้าภาพ) เท่านั้น
-- ไม่มี policy select ให้ anon = คนที่ได้ anon key ไปก็อ่านรายชื่อไม่ได้
drop policy if exists "hosts can read rsvp" on public.rsvps;
create policy "hosts can read rsvp"
  on public.rsvps
  for select
  to authenticated
  using (true);

-- แก้ไข/ลบได้เฉพาะผู้ที่ล็อกอินแล้ว
drop policy if exists "hosts can delete rsvp" on public.rsvps;
create policy "hosts can delete rsvp"
  on public.rsvps
  for delete
  to authenticated
  using (true);
