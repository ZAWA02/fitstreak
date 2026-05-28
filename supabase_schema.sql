-- =============================================
-- FitStreak データベース設定
-- Supabaseの SQL Editor に貼り付けて実行する
-- =============================================

create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  streak int default 0,
  created_at timestamp with time zone default now()
);

create table calendar_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  date text not null,
  muscle text not null,
  created_at timestamp with time zone default now(),
  unique(user_id, date)
);

create table workouts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  date text not null,
  muscle text not null,
  total_sets int default 0,
  total_volume float default 0,
  created_at timestamp with time zone default now()
);

create table workout_sets (
  id uuid default gen_random_uuid() primary key,
  workout_id uuid references workouts(id) on delete cascade not null,
  exercise_name text not null,
  set_number int not null,
  weight float default 0,
  reps int default 0,
  created_at timestamp with time zone default now()
);

create table personal_records (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  exercise_name text not null,
  max_weight float not null,
  updated_at timestamp with time zone default now(),
  unique(user_id, exercise_name)
);

create table earned_badges (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  badge_id text not null,
  earned_at timestamp with time zone default now(),
  unique(user_id, badge_id)
);

-- Row Level Security
alter table profiles enable row level security;
alter table calendar_plans enable row level security;
alter table workouts enable row level security;
alter table workout_sets enable row level security;
alter table personal_records enable row level security;
alter table earned_badges enable row level security;

create policy "自分のみ" on profiles for all using (auth.uid() = id);
create policy "自分のみ" on calendar_plans for all using (auth.uid() = user_id);
create policy "自分のみ" on workouts for all using (auth.uid() = user_id);
create policy "自分のみ" on workout_sets for all using (auth.uid() = (select user_id from workouts where id = workout_id));
create policy "自分のみ" on personal_records for all using (auth.uid() = user_id);
create policy "自分のみ" on earned_badges for all using (auth.uid() = user_id);
