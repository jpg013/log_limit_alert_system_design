import { Pool } from 'pg';
import { CreateLogRecordData, LogRecord, LogLimitAlert, PgNotifyEvent } from './types';
import { NotificationService } from './notification-service';
import { createLogRecordSql, listenForAlertsSql } from './sql';

/**
 * LogService interface defines a LogService with methods for creating a new LogRecord
 * and listening for LogLimit alerts.
 */
interface LogService {
  createLogRecord: (data: CreateLogRecordData) => Promise<LogRecord>;
  listenForLogLimitAlerts: () => void;
};

/**
 * Factory function that creates and returns a new LogService.
 */
export const createLogService = (pool: Pool, notificationService: NotificationService): LogService => {
  // Accepts a CreateLogRecordData input and creates a new log_record in the database
  const createLogRecord = async (data: CreateLogRecordData): Promise<LogRecord> => {
    const client = await pool.connect();

    try {
      const params = [
        data.logItemId.toString(),
        data.value,
        data.unit.toLowerCase(),
        data.timestamp.toISOString(),
      ];
      
      const { rows: [row] } = await client.query(createLogRecordSql, params);

      return {
        id: row.id,
        logItemId: row.log_item_id,
        value: row.value,
        unit: row.unit.toLowerCase(),
        timestamp: row.timestamp,
      };
    } catch (err) {
      console.error('Error creating log record', err);
      throw err;
    } finally {
      client.release();
    }
  };

  // Listens for "log_alert" notifications and sends them to the notification service.
  const listenForLogLimitAlerts = async () => {
    const client = await pool.connect();

    client.on('notification', async (event: PgNotifyEvent) => {
      try {
        const alertData = JSON.parse(event.payload);  
        
        // Simulate some async "sender", like pushing to Kinesis stream or Kafka Topic.
        process.nextTick(() => {
          // Fire and Forget alert to notification service
          console.log('sending alert to notificationService');
          notificationService.sendAlert({
            id: alertData.id,
            logLimitId: alertData.log_limit_id,
            exceededValue: alertData.exceeded_value,
            createdAt: alertData.created_at,
          });
        });
        
        console.log('Log Limit Alert: ', alertData);
      } catch (err) {
        console.error('error sending alert', err)
      }
    });

    // Tell the client to listen to Postgres for "log_alert" notifications 
    client.query(listenForAlertsSql);
  };

  return {
    createLogRecord,
    listenForLogLimitAlerts,
  };
}
