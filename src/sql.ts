export const createLogRecordSql = `
select * from create_log_record(
  $1::int, -- log_item_id
  $2::numeric, -- value
  $3::public.unit_enum, -- unit
  $4::timestamptz -- timestamp
)`;

export const listenForAlertsSql = 'listen log_alert';

export const createNotificationRecordSql = `
select * from public.create_notification_record(
  $1::int, -- lookup_id
  $2::int -- alert_id
)`;

export const getNotificationLookupsForAlertSql = `
select nl.* from public.notification_lookup nl
join public.log_limit_alert lla
on lla.log_limit_id = nl.log_limit_id
where lla.id = $1::int`;

