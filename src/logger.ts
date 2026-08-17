import pino from 'pino';
import { config } from './config.js';

const isProd = process.env.NODE_ENV === 'production';

const transport = isProd
  ? pino.destination({ dest: 2, sync: false })
  : pino.transport({
      target: 'pino-pretty',
      options: {
        destination: 2,
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    });

export const logger = pino(
  {
    level: config.logLevel,
    redact: {
      paths: ['token', 'api_token', 'apiToken', 'authorization', '*.api_token', '*.token'],
      censor: '[REDACTED]',
    },
  },
  transport,
);
