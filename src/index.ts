import { Pool } from 'pg';
import express from 'express';
import { makeLogService } from './log-service';
import { makeNotificationService } from './notification-service';
const app = express();
import bodyParser from 'body-parser';
import morgan from 'morgan';

app.use(bodyParser.json());
app.use(morgan('combined'));

const dbConfig = {
  connectionString: 'postgres://dev:dev@localhost:5432/dev',
  connectionTimeoutMillis: 10000,
  max: 10,
};

const pool = new Pool(dbConfig);
const notificationService = makeNotificationService(pool);
const logService = makeLogService(pool, notificationService);

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

logService.listenForLogLimitAlerts();

app.listen(8080, () => {
  console.log('App Running');
});
