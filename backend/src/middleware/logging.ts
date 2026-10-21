import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.authorization'],
});

// Structured JSON logs: request id, user id, duration and error code (research R11).
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  serializers: {
    req: (req: { id: unknown; method: unknown; url: unknown }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res: { statusCode: unknown }) => ({ statusCode: res.statusCode }),
  },
  customProps: (req, res) => ({
    userId: (req as { userId?: string }).userId,
    errorCode: (res as { locals?: Record<string, unknown> }).locals?.['errorCode'],
  }),
});
