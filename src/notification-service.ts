import { Pool } from 'pg';
import { LogLimitAlert, NotificationLookup } from './types';
import { createNotificationRecordSql, getNotificationLookupsForAlertSql } from './sql';

/**
 * NotificationService interface defines a NotificationService with methods
 * sending notifications for a LogLimitAlert.
 */
export interface NotificationService {
  sendAlert(alert: LogLimitAlert): Promise<void>;
}

// Factory function that accepts a Pool and returns a NotificationService.
export const createNotificationService = (pool: Pool): NotificationService => {
  // Accepts a LogLimitAlert and returns a list of NotificationLookups that match alert on
  // the unique LogLimitId.
  const getNotificationLookupsForAlert = async (alert: LogLimitAlert): Promise<NotificationLookup[]> => {
    const client = await pool.connect();
    
    try {
      const { rows } = await client.query(getNotificationLookupsForAlertSql, [alert.id.toString()])

      return rows.map((row) => ({
        id: row.id,
        logLimitId: row.log_limit_id,
        notificationType: row.notification_type,
        notificationAddress: row.notification_address,
        createdAt: row.created_at,
      }));
    } catch(err) {
      console.error('Error getting notification lookups', err);
    } finally {
      client.release();
    }
  };

  // Accepts a LogLimitAlert and a NotificationLookup and sends a notification
  // based on the notification type (e.g. "email", "sms", etc...). If the notificationType is not
  // handled an error is thrown.
  const sendAlertNotification = async (alert: LogLimitAlert, lookup: NotificationLookup) => {
    const { notificationType, notificationAddress } = lookup;
    const { exceededValue, logLimitId, createdAt } = alert;
    
    switch (notificationType) {
      case 'email':
        const emailParams = {
          email_address: notificationAddress,
          title: 'Log Limit Alert',
          exceededValue,
          logLimitId,
          timestamp: createdAt,
        };
        console.log('sending alert notification email with params',  emailParams);
        break;
      default:
        throw new Error(`Notification type "${notificationType}" not supported.`);
    };
  };
  
  // Main method for accepting a LogLimitAlert and sending out notifications.
  const sendAlert = async (alert: LogLimitAlert): Promise<void> => {
    const lookups = await getNotificationLookupsForAlert(alert);

    if (!lookups || !lookups.length) {
      return;
    }

    const notifications = lookups.map(async (lookup: NotificationLookup): Promise<void> => {
      const client = await pool.connect();

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

        await sendAlertNotification(alert, lookup);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
      } finally {
        client.release();
      }
    });

    await Promise.all(notifications);
  }

  return { sendAlert }
};