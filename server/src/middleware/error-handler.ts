import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger';

export interface ApiError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
  details?: any;
}

export function globalErrorHandler(err: ApiError, req: Request, res: Response, _next: NextFunction) {
  const status = err.status || err.statusCode || 500;
  const correlationId = req.correlationId || 'none';

  logger.error(err.message, 'GlobalErrorHandler', {
    status,
    path: req.originalUrl,
    method: req.method,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  }, correlationId);

  // RFC 7807 Standardized Problem Details
  res.status(status).json({
    type: err.type || `https://httpstatuses.com/${status}`,
    title: status === 500 ? 'Internal Server Error' : err.message,
    status,
    detail: err.message || 'An unexpected error occurred.',
    instance: req.originalUrl,
    correlationId,
    timestamp: new Date().toISOString()
  });
}
