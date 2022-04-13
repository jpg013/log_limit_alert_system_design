# Log Alert System Design

## Description

We need to notify users when they approach or exceed a limit.

Requirements
Send an email whenever a log entry causes a limit to be exceeded OR reach at least 90% of the limit, e.g. send the email if value > 0.9 * limit.

If the log entry causes an exceedance that the user has already been notified about (or a warning that the user has already been warned of), do not send the email.

For example, say they have a limit of 100 tons/month. Yesterday you emailed them to let them know they exceeded their limit (they were at 104 tons). Today (still the same month) they logged an additional 4 tons, so they are at 108 tons. Do not send another email.

On the other hand, let's say they have a limit of 100 tons/month and 1000 tons/year. Yesterday you emailed them to let them know they exceeded their limit (they were at 104 tons for the month, 999 for the year). Today (still the same month) they logged an additional 10 tons, so they have now exceeded their yearly limit as well (1009 tons for the year). Do send another email.

## Solution Overview
The database diagram I created for my solution can be seen here. [Database Diagram](https://dbdiagram.io/d/6256b78c2514c97903231267)

The general idea is that whenever a row is inserted into the "log_record" table a trigger function runs that calculates the
sum total value of all logs within a log_limit frequency for the particular log_item.  If that sum exceeds to allowed limit_value defined by
a log limit, then an alert will be generated.

A log-service is running and listening for log_limit alerts that are generated in the database. Once an alert
is received it is sent to a notification service to handle sending notifications for the alert.


## Demo
To see a demo of this solution run the following stepsL

### 1. Setup Databse Environment

1. With a local PostgreSql instance running, copy and run the `schema.sql` file in the root folder against your db instance.
2. Run the following SQL commands to a  `log_item` to log against and define `log_limis` for the item.

```sql
select * from public.create_log_item('Lead', 'grams', 'month');
select * from public.create_log_limit(1, 'grams', 100, 'month');
select * from public.create_log_limit(1, 'grams', 25, 'week');
select * from public.create_log_limit(1, 'grams', 5, 'day');
```

3. Run the following SQL command to create a notification lookup for each limit.

```sql
insert into public.notification_lookup (
	log_limit_id,
	notification_type,
	notification_address
) 
values
(1, 'email', 'john@monthlyalerts.com'),
(2, 'sms', 'mary@weeklyalerts.com'),
(3, 'tweet', 'ittwitter@dailyalerts.com');
```

4. Set the database connection in the `./src/index.ts` file

```ts

const pool = new Pool({
  // set config connection here
  connectionString: 'postgres://dev:dev@localhost:5432/dev',
  connectionTimeoutMillis: 10000,
  max: 10,
});

```

5. Run `yarn watch` to start the node server
6. Create new log records by posting to the `/log_record` endpoint on the server


```bash
curl -X POST \
-H "Content-Type: application/json" \
-d '{"log_item_id": 1, "unit": "grams", "value": 123.5, "timestamp": "2022-04-11T11:34:08.132Z"}' \
localhost:8080/log_record
```

7. When creating a log record causes a `log_limit` to be exceeded for a given frequency, an alert should be logged in the console.