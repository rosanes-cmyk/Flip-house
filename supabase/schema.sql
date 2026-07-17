-- Flip Scout database schema. Run this once in the Supabase SQL editor.

create table if not exists listings (
  id bigint generated always as identity primary key,
  address text,
  city text,
  price numeric,
  beds integer,
  baths numeric,
  sqft integer,
  property_type text,
  source_url text,
  buy_box_passed boolean,
  rejection_reason text,
  scraped_at timestamptz default now()
);

create table if not exists deal_analyses (
  id bigint generated always as identity primary key,
  address text,
  price numeric,
  arv_conservative numeric,
  arv_base numeric,
  arv_optimistic numeric,
  renovation_scope text,
  renovation_expected numeric,
  total_cost numeric,
  net_profit numeric,
  margin_on_cost numeric,
  margin_on_resale numeric,
  cash_required numeric,
  max_allowable_offer numeric,
  score numeric,
  confidence text,
  -- condition strategy fields
  condition_category text,
  condition_category_key text,
  condition_fit_score numeric,
  strategy_fit text,
  condition_gate text,
  estimated_timeline text,
  condition_confidence text,
  observation_source text,
  qualified boolean,
  recommendation text,
  next_step text,
  comps jsonb,
  risks text,
  analyzed_at timestamptz default now()
);

-- If deal_analyses already exists from v1, add the new columns:
alter table deal_analyses add column if not exists condition_category text;
alter table deal_analyses add column if not exists condition_category_key text;
alter table deal_analyses add column if not exists condition_fit_score numeric;
alter table deal_analyses add column if not exists strategy_fit text;
alter table deal_analyses add column if not exists condition_gate text;
alter table deal_analyses add column if not exists estimated_timeline text;
alter table deal_analyses add column if not exists condition_confidence text;
alter table deal_analyses add column if not exists observation_source text;
alter table deal_analyses add column if not exists qualified boolean;

create table if not exists daily_reports (
  id bigint generated always as identity primary key,
  report_date date,
  areas_searched jsonb,
  listings_found integer,
  buy_box_passed integer,
  qualified integer,
  top_deals jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_deal_score on deal_analyses (score desc);
create index if not exists idx_report_date on daily_reports (report_date desc);
