-- Personal calendar events (My Life calendar)
-- Separate from production projects — for personal appointments, reminders, etc.

create table if not exists personal_events (
  id text primary key,
  org_id text not null default '',
  title text not null,
  date text not null,
  start_time text not null default '',
  end_time text not null default '',
  all_day boolean not null default false,
  location text not null default '',
  notes text not null default '',
  category text not null default 'personal',  -- personal, appointment, reminder, etc.
  created_at timestamptz not null default now()
);
