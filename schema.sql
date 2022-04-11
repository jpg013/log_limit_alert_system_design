drop table if exists public.log_item cascade;
drop table if exists public.log_record cascade;
drop table if exists public.log_limit cascade;
drop table if exists public.log_limit_alert cascade;
drop table if exists public.notification_lookup cascade;
drop table if exists public.notification_record cascade;
drop type if exists public.unit_enum cascade;
drop type if exists public.frequency_enum cascade;
drop function if exists public.check_log_limit cascade;
drop function if exists public.notify_log_alert cascade;
drop trigger check_log_alert on public.log_record;
drop function if exists public.notify_new_alert;
drop trigger notify_new_alert on public.log_limit_alert;

-- create enum type to store "unit" values
create type public.unit_enum as enum (
	'grams',
	'liters'
);

create type public.frequency_enum as enum (
	'day',
	'week',
	'month',
	'year'
);

-- create public.log_item table that contains information about the type of
-- things that can be logged.
create table public.log_item (
	id int generated always as identity,
	name_of_pollutant text not null,
	unit public.unit_enum not null,
	frequency public.frequency_enum not null,
	primary key (id)
);

-- create "public.log_record" table that contains log data for a given log_item.
create table public.log_record (
	id int generated always as identity,
	log_item_id int not null,
	"value" numeric not null check ("value" > 0),
	"unit" public.unit_enum not null,
	"timestamp" timestamptz not null default current_timestamp,
	primary key (id)
);

-- add foreign key constraint "fk_log_item"
alter table only public.log_record
add constraint fk_log_item foreign key (log_item_id)
references public.log_item (id)
on delete cascade;

-- Add an index on "timestamp" 
create index log_record_timestamp_idx on public.log_record using btree ("timestamp");

-- create "public.log_limit" table that contains information about a log_item limit.
create table public.log_limit (
	id int generated always as identity,
	log_item_id int not null,
	unit public.unit_enum not null,
	limit_value numeric not null check ("limit_value" > 0),
	limit_frequency public.frequency_enum not null,
	primary key (id)
);

-- add foreign key constraint "fk_log_item"
alter table only public.log_limit
add constraint fk_log_item foreign key (log_item_id)
references public.log_item (id)
on delete cascade;

-- Table: public.log_limit_alert contains alert information for when a log_limit is exceeded.
create table public.log_limit_alert (
	id int generated always as identity,
	log_limit_id int not null,
	exceeded_value numeric not null,
	created_at timestamptz not null default current_timestamp,
	primary key (id)
);

-- add foreign key constraint "fk_log_limit"
alter table only public.log_limit_alert
add constraint fk_log_limit foreign key (log_limit_id)
references public.log_limit (id)
on delete cascade;

create table public.notification_lookup (
	id int generated always as identity,
	log_limit_id int not null,
	notification_type text not null,
	notification_address text not null,
	created_at timestamptz not null default current_timestamp,
	primary key (id)
);

-- add foreign key constraint "fk_log_limit"
alter table only public.notification_lookup
add constraint fk_log_limit foreign key (log_limit_id)
references public.log_limit (id)
on delete cascade;

create table public.notification_record (
	id int generated always as identity,
	notification_lookup_id int not null,
	log_limit_alert_id int not null,
	created_at timestamptz default current_timestamp,
	primary key (id)
);

alter table only public.notification_record
add constraint fk_notification_lookup foreign key (notification_lookup_id)
references public.notification_lookup (id)
on delete cascade;

alter table only public.notification_record
add constraint fk_alert foreign key (log_limit_alert_id)
references public.log_limit_alert (id)
on delete cascade;

create unique index unique_notification_record_idx on public.notification_record (notification_lookup_id, log_limit_alert_id);

-- Function: "public.create_log_item" - accepts inputs and creates a new log_item.
create or replace function public.create_log_item(v_name text, v_units public.unit_enum, v_freq public.frequency_enum)
returns public.log_item
language sql strict
as $$
	insert into public.log_item (name_of_pollutant, unit, frequency)
	values (v_name, v_units, v_freq)
	returning *;
$$;

-- Function: "public.create_log_record" - accepts inputs and creates a new log_record.
create or replace function public.create_log_record(
	v_log_item_id int,
	v_value numeric,
	v_unit public.unit_enum,
	v_timestamp timestamptz
) returns public.log_record
language sql strict
as $$
	insert into public.log_record (log_item_id, "value", unit, "timestamp")
	values (v_log_item_id, v_value, v_unit, least(v_timestamp, CURRENT_TIMESTAMP))
	returning *;
$$;

-- Function: "public.create_log_limit" - accepts inputs and creates a new log_limit.
create or replace function public.create_log_limit(
	v_log_item_id int,
	v_unit public.unit_enum,
  v_limit numeric,
	v_freq public.frequency_enum
) returns public.log_limit
language sql strict
as $$
	insert into public.log_limit (log_item_id, "unit", "limit_value", "limit_frequency")
	values (v_log_item_id, v_unit, v_limit, v_freq)
	returning *;
$$;

-- Function: "public.create_notification_record" - accepts inputs and creates a new notification_record.
create or replace function public.create_notification_record (
	v_lookup_id int,
	v_alert_id int
) returns public.notification_record
as $$
	insert into public.notification_record (notification_lookup_id, log_limit_alert_id)
	values (v_lookup_id, v_alert_id)
	on conflict (notification_lookup_id, log_limit_alert_id) do nothing
	returning *;
$$ language sql strict;

create or replace function public.is_within_frequency(v_freq public.frequency_enum, v_ts timestamptz) returns boolean as 
$$
	select case v_freq
		when 'month'::public.frequency_enum
			then v_ts between date_trunc('month', current_timestamp) and date_trunc('month', current_timestamp) + INTERVAL '1 month'	
		when 'week'::public.frequency_enum
			then v_ts between date_trunc('week', current_timestamp) and date_trunc('week', current_timestamp) + INTERVAL '1 week'
		when 'year'::public.frequency_enum
			then v_ts between date_trunc('year', current_timestamp) and date_trunc('year', current_timestamp) + INTERVAL '1 year'
		when 'day'::public.frequency_enum
			then v_ts between date_trunc('day', current_timestamp) and date_trunc('day', current_timestamp) + INTERVAL '1 day'
	end as is_within_frequency
$$ language sql strict;

create or replace function public.sum_log_value_over_frequency(
	v_log_item_id int, 
	v_freq public.frequency_enum
) returns numeric
language sql strict
as $$
	select sum(log.value) from public.log_record log
	where log.log_item_id = v_log_item_id
	and public.is_within_frequency(v_freq, log."timestamp");
$$;

create or replace function public.check_log_limit() returns trigger 
as $$
	begin
		with sub as (
			select 
				lim.id as "log_limit_id",
				lim.limit_value as "limit_value",
				lim.limit_frequency as "limit_frequency",
				public.sum_log_value_over_frequency(lim.log_item_id, lim.limit_frequency) as "sum_total_over_frequency"
			from public.log_limit lim
			where lim.log_item_id = NEW.log_item_id
			and not exists (
				select 1 from public.log_limit_alert la
				where la.log_limit_id = lim.id
				and public.is_within_frequency(lim.limit_frequency, la.created_at) = true
			)
		)
		insert into public.log_limit_alert (
			log_limit_id,
			exceeded_value,
			created_at
		)
		select
			sub.log_limit_id,
			sub.sum_total_over_frequency - sub.limit_value,
			current_timestamp
		from sub
		where sub.sum_total_over_frequency > sub.limit_value;
		return new;
	end;
$$ language plpgsql;

create trigger check_log_limit after insert or update on public.log_record
for each row execute function check_log_limit();

create or replace function public.notify_new_alert() returns trigger as
$$
	begin
		perform pg_notify('log_alert', row_to_json(NEW)::text);
		return null;
	end;
$$
language plpgsql volatile;

create trigger notify_new_alert
after insert
on "public"."log_limit_alert"
for each row
execute procedure notify_new_alert();

select * from public.create_log_item('Nitrate', 'grams', 'month');
select * from public.create_log_limit(1, 'grams', 100, 'month');
select * from public.create_log_limit(1, 'grams', 25, 'week');
select * from public.create_log_limit(1, 'grams', 5, 'day');
select * from public.create_log_record(1, 12, 'grams', '2022-04-09'::timestamptz);
select * from public.create_log_record(1, 86, 'grams', '2022-04-09'::timestamptz);
select * from public.create_log_record(1, 2.1, 'grams', '2022-04-09'::timestamptz);
