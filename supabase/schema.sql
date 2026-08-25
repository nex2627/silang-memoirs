-- SILANG MEMOIRS — NEXEMERAL 27
-- Safe to paste and run in the SQL Editor even on a project that already has
-- the earlier version of this schema. Everything below uses IF NOT EXISTS /
-- ADD VALUE IF NOT EXISTS so it migrates your existing data in place —
-- it will not delete or reset anything.

create extension if not exists pgcrypto;

do $$ begin create type user_role as enum ('admin','head_media','head_layout','head_writer','head_researcher','staff_media','staff_layout','staff_writer','staff_researcher'); exception when duplicate_object then null; end $$;
alter type user_role add value if not exists 'head_colorist';
alter type user_role add value if not exists 'staff_colorist';

do $$ begin create type task_status as enum ('not_started','in_progress','completed'); exception when duplicate_object then null; end $$;
do $$ begin create type task_priority as enum ('low','medium','high'); exception when duplicate_object then null; end $$;
do $$ begin create type schedule_status as enum ('scheduled','completed','claimed','done'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null,
 email text,
 role user_role not null default 'staff_media',
 department text not null,
 position text,
 avatar_url text,
 active boolean not null default true,
 created_at timestamptz not null default now()
);

create table if not exists public.tasks (
 id uuid primary key default gen_random_uuid(), title text not null, description text,
 department text not null, assigned_to uuid references public.profiles(id) on delete set null,
 created_by uuid references public.profiles(id) on delete set null, due_date date,
 priority task_priority not null default 'medium', status task_status not null default 'not_started',
 completed_at timestamptz, created_at timestamptz not null default now()
);
alter table public.tasks add column if not exists assigned_date date;
alter table public.tasks add column if not exists schedule_id uuid references public.schedules(id) on delete set null;

create table if not exists public.schedules (
 id uuid primary key default gen_random_uuid(), title text not null, description text, location text,
 department text not null, start_at timestamptz not null, end_at timestamptz not null,
 created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(),
 constraint schedule_time_valid check (end_at > start_at)
);
alter table public.schedules add column if not exists status schedule_status not null default 'scheduled';
alter table public.schedules add column if not exists claimed_by uuid references public.profiles(id) on delete set null;
alter table public.schedules add column if not exists claimed_at timestamptz;
alter table public.schedules add column if not exists due_at timestamptz;

create table if not exists public.schedule_members (
 schedule_id uuid references public.schedules(id) on delete cascade,
 member_id uuid references public.profiles(id) on delete cascade,
 primary key(schedule_id,member_id)
);

create table if not exists public.outputs (
 id uuid primary key default gen_random_uuid(), title text not null, url text not null, notes text,
 task_id uuid references public.tasks(id) on delete set null, user_id uuid not null references public.profiles(id) on delete cascade,
 department text not null, created_at timestamptz not null default now()
);

create table if not exists public.resources (
 id uuid primary key default gen_random_uuid(), name text not null, description text, url text not null,
 resource_type text not null, department text, created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);

create table if not exists public.integrations (
 id uuid primary key default gen_random_uuid(), scope text not null unique, -- 'ALL' for admin, or department name
 sheet_webhook_url text, updated_by uuid references public.profiles(id) on delete set null, updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, body text, kind text not null default 'info',
 read boolean not null default false, created_at timestamptz not null default now()
);

create table if not exists public.announcements (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid references public.profiles(id) on delete set null,
 title text not null, body text not null,
 audience text not null default 'all', -- 'all' | 'heads' | 'staff' | 'custom'
 target_user_ids uuid[] not null default '{}',
 created_at timestamptz not null default now()
);

create or replace function public.get_my_role() returns text language sql stable security definer set search_path=public as $$ select role::text from public.profiles where id=auth.uid() $$;
create or replace function public.get_my_department() returns text language sql stable security definer set search_path=public as $$ select department from public.profiles where id=auth.uid() $$;
-- Security-definer helpers so schedules <-> schedule_members policies never query each other through RLS (avoids infinite recursion).
create or replace function public.is_schedule_member(sid uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.schedule_members where schedule_id=sid and member_id=auth.uid()) $$;
create or replace function public.schedule_department(sid uuid) returns text language sql stable security definer set search_path=public as $$ select department from public.schedules where id=sid $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,full_name,email,role,department,position,avatar_url)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email),new.email,coalesce((new.raw_user_meta_data->>'role')::user_role,'staff_media'),coalesce(new.raw_user_meta_data->>'department','Media'),new.raw_user_meta_data->>'position',new.raw_user_meta_data->>'avatar_url')
 on conflict(id) do nothing;
 return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Notifications: auto-fired on task assignment, schedule assignment, and colorist handoff
create or replace function public.notify_task_assigned() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.assigned_to is not null and (tg_op='INSERT' or old.assigned_to is distinct from new.assigned_to) then
   insert into public.notifications(user_id,title,body,kind) values(new.assigned_to,'New task assigned',new.title,'task');
 end if;
 return new;
end; $$;
drop trigger if exists on_task_assigned on public.tasks;
create trigger on_task_assigned after insert or update of assigned_to on public.tasks for each row execute procedure public.notify_task_assigned();

create or replace function public.notify_schedule_member() returns trigger language plpgsql security definer set search_path=public as $$
declare sched record;
begin
 select title into sched from public.schedules where id=new.schedule_id;
 insert into public.notifications(user_id,title,body,kind) values(new.member_id,'New schedule assigned',coalesce(sched.title,'Schedule'),'schedule');
 return new;
end; $$;
drop trigger if exists on_schedule_member_added on public.schedule_members;
create trigger on_schedule_member_added after insert on public.schedule_members for each row execute procedure public.notify_schedule_member();

create or replace function public.notify_colorist() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.department='Media' and new.status='completed' and (old.status is distinct from new.status) then
   insert into public.notifications(user_id,title,body,kind)
   select id,'Event ready for color grading',new.title,'colorist' from public.profiles where role in ('head_colorist','staff_colorist');
 end if;
 if new.claimed_by is not null and (old.claimed_by is distinct from new.claimed_by) then
   insert into public.notifications(user_id,title,body,kind) values(new.claimed_by,'Assigned to color grade',new.title,'colorist');
 end if;
 return new;
end; $$;
drop trigger if exists on_schedule_status_change on public.schedules;
create trigger on_schedule_status_change after update on public.schedules for each row execute procedure public.notify_colorist();

-- Colorist due date: automatically 3 days from the moment someone is assigned
create or replace function public.set_colorist_due() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.claimed_by is not null and old.claimed_by is distinct from new.claimed_by then
    new.claimed_at:=now(); new.due_at:=now()+interval '3 days';
  end if;
  return new;
end; $$;
drop trigger if exists on_schedule_claim on public.schedules;
create trigger on_schedule_claim before update on public.schedules for each row execute procedure public.set_colorist_due();

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_members enable row level security;
alter table public.outputs enable row level security;
alter table public.resources enable row level security;
alter table public.integrations enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;

-- Drop policies so this script can be safely re-run.
do $$ declare r record; begin for r in (select policyname,tablename from pg_policies where schemaname='public') loop execute format('drop policy if exists %I on public.%I',r.policyname,r.tablename); end loop; end $$;

-- Profiles
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_admin on public.profiles for update to authenticated using (public.get_my_role()='admin' or id=auth.uid()) with check (public.get_my_role()='admin' or id=auth.uid());

-- Tasks
create policy tasks_select on public.tasks for select to authenticated using (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and department=public.get_my_department()) or assigned_to=auth.uid() or (public.get_my_role()='head_layout' and department='Colorist'));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and department=public.get_my_department()));
create policy tasks_update on public.tasks for update to authenticated using (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and department=public.get_my_department()) or assigned_to=auth.uid()) with check (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and department=public.get_my_department()) or assigned_to=auth.uid());
create policy tasks_delete on public.tasks for delete to authenticated using (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and department=public.get_my_department()));

-- Schedules (includes colorist claim workflow on Media events)
create policy schedules_select on public.schedules for select to authenticated using (
  public.get_my_role()='admin'
  or (public.get_my_role() like 'head_%' and department=public.get_my_department())
  or public.is_schedule_member(id)
  or (public.get_my_role() in ('head_writer','head_colorist','head_layout') and department='Media' and status='completed')
);
create policy schedules_insert on public.schedules for insert to authenticated with check (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and department=public.get_my_department()));
create policy schedules_update on public.schedules for update to authenticated using (
  public.get_my_role()='admin'
  or (public.get_my_role() like 'head_%' and department=public.get_my_department())
) with check (
  public.get_my_role()='admin'
  or (public.get_my_role() like 'head_%' and department=public.get_my_department())
);
create policy schedules_delete on public.schedules for delete to authenticated using (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and department=public.get_my_department()));

-- Schedule members
create policy schedule_members_select on public.schedule_members for select to authenticated using (public.get_my_role()='admin' or public.schedule_department(schedule_id)=public.get_my_department() or member_id=auth.uid());
create policy schedule_members_insert on public.schedule_members for insert to authenticated with check (public.get_my_role()='admin' or public.schedule_department(schedule_id)=public.get_my_department());
create policy schedule_members_delete on public.schedule_members for delete to authenticated using (public.get_my_role()='admin' or public.schedule_department(schedule_id)=public.get_my_department());

-- Outputs (task-mode departments only, enforced in UI — table itself is open per-department)
create policy outputs_select on public.outputs for select to authenticated using (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and department=public.get_my_department()) or user_id=auth.uid());
create policy outputs_insert on public.outputs for insert to authenticated with check (user_id=auth.uid() and department=public.get_my_department());
create policy outputs_update on public.outputs for update to authenticated using (public.get_my_role()='admin' or user_id=auth.uid()) with check (public.get_my_role()='admin' or user_id=auth.uid());
create policy outputs_delete on public.outputs for delete to authenticated using (public.get_my_role()='admin' or user_id=auth.uid());

-- Resources
create policy resources_select on public.resources for select to authenticated using (public.get_my_role()='admin' or department is null or department=public.get_my_department());
create policy resources_insert on public.resources for insert to authenticated with check (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and (department=public.get_my_department() or department is null)));
create policy resources_update on public.resources for update to authenticated using (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and department=public.get_my_department())) with check (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and department=public.get_my_department()));
create policy resources_delete on public.resources for delete to authenticated using (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and department=public.get_my_department()));

-- Integrations (Google Sheets backup webhook per scope)
create policy integrations_select on public.integrations for select to authenticated using (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and scope=public.get_my_department()));
create policy integrations_insert on public.integrations for insert to authenticated with check (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and scope=public.get_my_department()));
create policy integrations_update on public.integrations for update to authenticated using (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and scope=public.get_my_department())) with check (public.get_my_role()='admin' or (public.get_my_role() like 'head_%' and scope=public.get_my_department()));

-- Notifications
create policy notifications_select on public.notifications for select to authenticated using (user_id=auth.uid() or public.get_my_role()='admin');
create policy notifications_update on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated with check (public.get_my_role()='admin');

-- Announcements (admin broadcasts; delivered as notifications client-side)
create policy announcements_select on public.announcements for select to authenticated using (true);
create policy announcements_insert on public.announcements for insert to authenticated with check (public.get_my_role()='admin');

-- Rename departments (data migration — safe to re-run, only affects rows that still have the old name)
update public.profiles set department='Layout Artist' where department='Layout';
update public.profiles set department='Writer' where department='Writing';
update public.profiles set department='Researcher' where department='Research';
update public.tasks set department='Layout Artist' where department='Layout';
update public.tasks set department='Writer' where department='Writing';
update public.tasks set department='Researcher' where department='Research';
update public.resources set department='Layout Artist' where department='Layout';
update public.resources set department='Writer' where department='Writing';
update public.resources set department='Researcher' where department='Research';
update public.outputs set department='Layout Artist' where department='Layout';
update public.outputs set department='Writer' where department='Writing';
update public.outputs set department='Researcher' where department='Research';
update public.integrations set scope='Layout Artist' where scope='Layout';
update public.integrations set scope='Writer' where scope='Writing';
update public.integrations set scope='Researcher' where scope='Research';

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.profiles,public.tasks,public.schedules,public.schedule_members,public.outputs,public.resources,public.integrations,public.notifications,public.announcements to authenticated;
