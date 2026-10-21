import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import type { JWTVerifyGetKey } from 'jose';
import { env } from './config/env';
import { authMiddleware } from './middleware/auth';
import { ensureProfileMiddleware } from './middleware/ensure-profile';
import { timezoneMiddleware } from './middleware/timezone';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { httpLogger } from './middleware/logging';
import { ipRateLimit, userRateLimit } from './middleware/rate-limit';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { maintenanceRouter } from './modules/maintenance/maintenance.routes';
import { servicesRouter } from './modules/services/services.routes';
import { profileRouter } from './modules/profile/profile.routes';
import { readingsRouter } from './modules/readings/readings.routes';
import { vehiclesRouter } from './modules/vehicles/vehicles.routes';

export interface AppOptions {
  /** Overrides the Supabase JWKS (tests). */
  jwks?: JWTVerifyGetKey;
  rateLimit?: boolean;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
  app.use(httpLogger);
  const rateLimited = options.rateLimit ?? env.NODE_ENV !== 'test';
  if (rateLimited) app.use(ipRateLimit);
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const v1 = Router();
  v1.use(authMiddleware(options.jwks));
  if (rateLimited) v1.use(userRateLimit);
  v1.use(ensureProfileMiddleware);
  v1.use(timezoneMiddleware);
  v1.use(profileRouter);
  v1.use(vehiclesRouter);
  v1.use(readingsRouter);
  v1.use(catalogRouter);
  v1.use(maintenanceRouter);
  v1.use(servicesRouter);
  app.use('/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
