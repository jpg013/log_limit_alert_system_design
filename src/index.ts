import { Pool } from 'pg';
import express from 'express';
import { createLogService } from './log-service';
import { createNotificationService } from './notification-service';
const app = express();
import bodyParser from 'body-parser';
import morgan from 'morgan';

// config middleware
app.use(bodyParser.json());
app.use(morgan('combined'));

// New db connection pool
const pool = new Pool({
  connectionString: 'postgres://dev:dev@localhost:5432/dev',
  connectionTimeoutMillis: 10000,
  max: 10,
});

const notificationService = createNotificationService(pool);
const logService = createLogService(pool, notificationService);

// Define route handler for POST "/log_record"
app.post('/log_record', async (req, res) => {
  try {
    const result = await logService.createLogRecord({
      logItemId: req.body.log_item_id,
      value: req.body.value,
      unit: req.body.unit,
      timestamp: new Date(req.body.timestamp),
    });
    res.json(result);  
  } catch (err) {
    res.status(500).send((err as Error).message);
  };
});

// Tell logService to start listening for any logLimit alerts
logService.listenForLogLimitAlerts();

// Run App
app.listen(8080, () => {
  console.log('App Running on port 8080');
});
