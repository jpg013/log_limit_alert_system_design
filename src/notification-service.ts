import { Pool } from 'pg';
import { LogLimitAlert, NotificationLookup } from './types';
import { createNotificationRecordSql, getNotificationLookupsForAlertSql } from './sql';

export interface NotificationService {
  sendAlert(alert: LogLimitAlert): Promise<void>;
}

class LogLimitAlertNotificationService implements NotificationService {
  private pool: Pool;
  
  constructor(pool: Pool) {
    this.pool = pool;
  }

  async getNotificationLookupsForAlert(alert: LogLimitAlert): Promise<NotificationLookup[]> {
    const client = await this.pool.connect();
    const { rows } = await client.query(getNotificationLookupsForAlertSql, [alert.id.toString()])

    return rows.map((row) => ({
      id: row.id,
      logLimitId: row.log_limit_id,
      notificationType: row.notification_type,
      notificationAddress: row.notification_address,
      createdAt: row.created_at,
    }));
  }

  async sendAlertNotification(alert: LogLimitAlert, notificationLookup: NotificationLookup): Promise<void> {
    switch (notificationLookup.notificationType) {
      case 'email':
        const emailParams = {
          email_address: notificationLookup.notificationAddress,
          title: 'Log Limit Alert',
          exceededValue: alert.exceededValue,
          logLimitId: alert.logLimitId,
          timestamp: alert.createdAt,
        };
        console.log('sending alert notification email with params',  emailParams);
        break;
      default:
        throw new Error(`Notification type "${notificationLookup.notificationType}" not supported.`);
    };
  }

  async sendAlert(alert: LogLimitAlert): Promise<void> {
    const lookups = await this.getNotificationLookupsForAlert(alert);  

    if (!lookups || !lookups.length) {
      return;
    }

    const notifications = lookups.map(async (lookup: NotificationLookup): Promise<void> => {
      const client = await this.pool.connect();

      try {
        await client.query('BEGIN');

        const { rows: [row] } = await client.query(
          createNotificationRecordSql,
          [
            lookup.id.toString(),
            alert.id.toString()
          ],
        );

        if (!row || !row.id) {
          throw new Error(`Duplicate NotificationRecord exists for LogLimitAlert id "${alert}"`);
        }

        console.log('Notification record created', row);

        await this.sendAlertNotification(alert, lookup);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
      }
    });

    await Promise.all(notifications);
  }
}


export const makeNotificationService = (pool: Pool) => new LogLimitAlertNotificationService(pool);