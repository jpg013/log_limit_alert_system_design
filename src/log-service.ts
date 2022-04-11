import { Pool } from 'pg';
import { CreateLogRecordData, LogRecord, LogLimitAlert, PgNotifyEvent } from './types';
import { NotificationService } from './notification-service';
import { createLogRecordSql, listenForAlertsSql } from './sql';

interface LogService {
  createLogRecord: (data: CreateLogRecordData) => Promise<LogRecord>;
  listenForLogLimitAlerts: () => void;
};

export const makeLogService = (pool: Pool, notificationService: NotificationService): LogService => {
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
    }
  };

  const listenForLogLimitAlerts = async () => {
    const client = await pool.connect();

    client.on('notification', async (event: PgNotifyEvent) => {
      try {
        const alertData = JSON.parse(event.payload);  
        
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

    client.query(listenForAlertsSql);
  };

  return {
    createLogRecord,
    listenForLogLimitAlerts,
  };
}
