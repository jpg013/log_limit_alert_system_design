export enum UnitEnum {
  Grams  = 'grams',
  Liters = 'liters'
};

export enum FrequencyEnum {
  Day = 'day',
  Week = 'week',
  Month = 'month',
  Year = 'year'
};

export type LogRecord = {
  id: number;
  logItemId: number;
  value: number;
  unit: UnitEnum,
  timestamp: Date,
};

export type CreateLogRecordData = {
  logItemId: number;
  value: number;
  unit: UnitEnum,
  timestamp: Date,
};

export type LogLimitAlert = {
  id: number;
  logLimitId: number;
  exceededValue: number;
  createdAt: number;
};

export interface PgNotifyEvent {
  channel: string;
  payload: string;
  processId: number;
  length: number;
};

export type NotificationLookup = {
  id: number;
	logLimitId: number;
	notificationType: string;
	notificationAddress: string;
  createdAt: Date;
};

export type NotificationRecord = {
  id: number;
	notificationLookupId: number;
	logLimitAlertId: number;
  createdAt: Date;
};