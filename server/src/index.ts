import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

import db from './db/database';
import { runMigrations } from './db/migrations';
import { seedDatabase } from './db/seed';

// Core Operations Routers
import { authRouter } from './modules/auth/auth.router';
import { coreRouter } from './modules/core/core.router';
import { repairRouter } from './modules/repair/repair.router';
import { repairLabAnalyticsRouter } from './modules/repair/repair-lab-analytics.router';
import { retailRouter } from './modules/retail/retail.router';
import { retailIntelligenceRouter } from './modules/retail/retail-intelligence.router';
import { sparePartsRouter } from './modules/spare-parts/spare-parts.router';
import { sparePartsIntelligenceRouter } from './modules/spare-parts/spare-parts-intelligence.router';
import { fintechRouter } from './modules/fintech/fintech.router';
import { fintechIntelligenceRouter } from './modules/fintech/fintech-intelligence.router';

// Enterprise ERP Routers (1-8)
import { accountingRouter } from './modules/accounting/accounting.router';
import { inventoryRouter } from './modules/inventory/inventory.router';
import { procurementRouter } from './modules/procurement/procurement.router';
import { hrRouter } from './modules/hr/hr.router';
import { projectsRouter } from './modules/projects/projects.router';
import { loyaltyRouter } from './modules/loyalty/loyalty.router';
import { appointmentsRouter } from './modules/appointments/appointments.router';
import { reportsRouter } from './modules/reports/reports.router';

// Platform & Security
import { securityRouter } from './modules/security/security.router';
import { searchRouter } from './modules/search/search.router';
import { uploadRouter } from './modules/upload/upload.router';
import { docsRouter } from './modules/docs/docs.router';

// 35 New Proposals Routers
import { aiRouter } from './modules/ai/ai.router';
import { integrationsRouter } from './modules/integrations/integrations.router';
import { advancedRepairRouter } from './modules/advanced-repair/advanced-repair.router';
import { advancedInventoryRouter } from './modules/advanced-inventory/advanced-inventory.router';
import { enterpriseRouter } from './modules/enterprise/enterprise.router';
import { mobileRouter } from './modules/mobile/mobile.router';

// Batch 3 Enterprise Routers
import { customerExperienceRouter } from './modules/customer-experience/customer-experience.router';
import { insuranceRouter } from './modules/insurance/insurance.router';
import { ecommerceStoreRouter } from './modules/ecommerce-store/ecommerce-store.router';
import { multiBranchRouter } from './modules/multi-branch/multi-branch.router';
import { contractsRouter } from './modules/contracts/contracts.router';
import { refurbishedRouter } from './modules/refurbished/refurbished.router';
import { businessRulesRouter } from './modules/business-rules/business-rules.router';
import { kittingRouter } from './modules/kitting/kitting.router';
import { stolenRegistryRouter } from './modules/stolen-registry/stolen-registry.router';
import { portalRouter } from './modules/portal/portal.router';

// Middlewares & Services
import { correlationMiddleware } from './middleware/correlation';
import { csrfProtection, enforceHttps } from './middleware/csrf';
import { subnetAndDeviceGuard } from './middleware/subnet-guard';
import { globalErrorHandler } from './middleware/error-handler';
import { requireModule } from './middleware/feature-flag';
import { logger } from './services/logger';
import { wsService } from './services/ws.service';
import { cacheService } from './services/cache.service';
import { queueService } from './services/queue.service';
import { ERP_CONSTANTS } from './constants/erp.constants';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// 1. Correlation ID Middleware for distributed tracing (Maintenance Proposal 31)
app.use(correlationMiddleware);

// 2. HTTPS enforcement in production (Maintenance Proposal 7)
app.use(enforceHttps);

// 3. Security Middleware: Helmet HTTP Headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// 4. Strict CORS Configuration
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '15mb' }));

// 5. CSRF Protection Middleware (Maintenance Proposal 4)
app.use(csrfProtection);

// 6. Input Sanitization Middleware (XSS Payload Clean)
function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    const cleanObject = (obj: any) => {
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          cleanObject(obj[key]);
        }
      }
    };
    cleanObject(req.body);
  }
  next();
}
app.use(sanitizeInput);

// 7. Granular Rate Limiting
export const authLimiter = rateLimit({
  windowMs: ERP_CONSTANTS.RATE_LIMIT.AUTH_WINDOW_MS,
  max: ERP_CONSTANTS.RATE_LIMIT.AUTH_MAX_ATTEMPTS,
  message: { success: false, error: 'Too many authentication attempts. Please try again in 1 minute.', code: 'RATE_LIMIT_EXCEEDED' }
});

export const fintechTransferLimiter = rateLimit({
  windowMs: ERP_CONSTANTS.RATE_LIMIT.FINTECH_TRANSFER_WINDOW_MS,
  max: ERP_CONSTANTS.RATE_LIMIT.FINTECH_TRANSFER_MAX_REQUESTS,
  message: { success: false, error: 'Too many transfer attempts. Please try again in 1 minute.', code: 'RATE_LIMIT_EXCEEDED' }
});

export const repairEstimateLimiter = rateLimit({
  windowMs: ERP_CONSTANTS.RATE_LIMIT.REPAIR_ESTIMATE_WINDOW_MS,
  max: ERP_CONSTANTS.RATE_LIMIT.REPAIR_ESTIMATE_MAX_REQUESTS,
  message: { success: false, error: 'Too many estimate notifications sent. Please try again later.', code: 'RATE_LIMIT_EXCEEDED' }
});

export const generalLimiter = rateLimit({
  windowMs: ERP_CONSTANTS.RATE_LIMIT.GENERAL_WINDOW_MS,
  max: ERP_CONSTANTS.RATE_LIMIT.GENERAL_MAX_REQUESTS,
  message: { success: false, error: 'Rate limit exceeded. Please slow down requests.', code: 'RATE_LIMIT_EXCEEDED' }
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/fintech/transfer', fintechTransferLimiter);
app.use('/api/repairs/:id/send-estimate', repairEstimateLimiter);
app.use('/api/repair/tickets/:id/send-estimate', repairEstimateLimiter);
app.use('/api/repair/:id/send-estimate', repairEstimateLimiter);

// 8. Initialize database schema and seed data
runMigrations();
seedDatabase();

// 9. Initialize WebSocket gateway
wsService.init(server);

export { requireModule };

// 10. Subnet Firewall & Workstation Device Hardware Token Gate (DEC-020, DEC-043)
app.use(subnetAndDeviceGuard);

// Register All Core & Enterprise Modules
app.use('/api/auth', authRouter);
app.use('/api/core', coreRouter);
app.use('/api/repair', requireModule('enable_repair', 'RepairLabModule'), repairRouter);
app.use('/api/repair/analytics', requireModule('enable_repair', 'RepairLabAnalytics'), repairLabAnalyticsRouter);
app.use('/api/retail', requireModule('enable_retail', 'RetailPOSModule'), retailRouter);
app.use('/api/retail/intelligence', requireModule('enable_retail', 'RetailIntelligence'), retailIntelligenceRouter);
app.use('/api/spare-parts', requireModule('enable_spare_parts', 'SparePartsModule'), sparePartsRouter);
app.use('/api/spare-parts/intelligence', requireModule('enable_spare_parts', 'SparePartsIntelligence'), sparePartsIntelligenceRouter);
app.use('/api/fintech', requireModule('enable_fintech', 'FintechCashModule'), fintechRouter);
app.use('/api/fintech/intelligence', requireModule('enable_fintech', 'FintechIntelligence'), fintechIntelligenceRouter);

// New Modules (1-8)
app.use('/api/accounting', requireModule('enable_accounting', 'AccountingModule'), accountingRouter);
app.use('/api/inventory', requireModule('enable_inventory', 'InventoryModule'), inventoryRouter);
app.use('/api/procurement', procurementRouter);
app.use('/api/hr', requireModule('enable_hr', 'HRModule'), hrRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/loyalty', loyaltyRouter);
app.use('/api/appointments', requireModule('enable_appointments', 'AppointmentsModule'), appointmentsRouter);
app.use('/api/reports', reportsRouter);

// Platform & Security
app.use('/api/security', securityRouter);
app.use('/api/search', searchRouter);
app.use('/api/uploads', uploadRouter);
app.use('/api/docs', docsRouter);

// 35 New Proposals Routers
app.use('/api/ai', aiRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/advanced-repair', advancedRepairRouter);
app.use('/api/advanced-inventory', advancedInventoryRouter);
app.use('/api/enterprise', enterpriseRouter);
app.use('/api/mobile', mobileRouter);

// Batch 3 Enterprise 70 Proposals Routers
app.use('/api/cx', customerExperienceRouter);
app.use('/api/insurance', insuranceRouter);
app.use('/api/ecommerce', ecommerceStoreRouter);
app.use('/api/branches', multiBranchRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/refurbished', refurbishedRouter);
app.use('/api/rules', businessRulesRouter);
app.use('/api/kitting', kittingRouter);
app.use('/api/stolen-registry', stolenRegistryRouter);
app.use('/api/portal', portalRouter);

// Application Performance Monitoring (APM) Metrics
app.get('/api/monitoring/metrics', (_req: Request, res: Response) => {
  const memUsage = process.memoryUsage();
  res.json({
    status: 'OPTIMAL',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rssMB: (memUsage.rss / 1024 / 1024).toFixed(2),
      heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: (memUsage.heapTotal / 1024 / 1024).toFixed(2)
    },
    activeWebSockets: wsService.getActiveClientsCount(),
    cache: cacheService.status(),
    queue: queueService.getStats()
  });
});

// Deep Health Check & Diagnostics Endpoint (Maintenance Proposal 32)
app.get('/api/health', (_req: Request, res: Response) => {
  const memUsage = process.memoryUsage();
  let dbSizeBytes = 0;
  const dbPath = path.join(__dirname, '../data/erp.db');
  if (fs.existsSync(dbPath)) {
    dbSizeBytes = fs.statSync(dbPath).size;
  }

  // SQLite PRAGMA quick_check to verify database integrity
  let integrityCheck = 'UNKNOWN';
  try {
    const checkResult = db.prepare('PRAGMA quick_check;').get() as any;
    integrityCheck = checkResult?.quick_check || 'ok';
  } catch (e: any) {
    integrityCheck = `FAILED: ${e.message}`;
  }

  const store = db.prepare('SELECT id, name, enable_repair, enable_retail, enable_spare_parts, enable_fintech FROM stores LIMIT 1').get();

  res.json({
    status: integrityCheck === 'ok' ? 'HEALTHY' : 'DEGRADED',
    system: 'Modular Mobile ERP 2.0 (Desktop & Mobile)',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    store,
    memory: {
      rssMB: (memUsage.rss / 1024 / 1024).toFixed(2),
      heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(2)
    },
    database: {
      driver: 'better-sqlite3 (WAL Mode)',
      integrity: integrityCheck,
      sizeBytes: dbSizeBytes,
      sizeMB: (dbSizeBytes / 1024 / 1024).toFixed(2)
    },
    cache: cacheService.status(),
    queue: queueService.getStats(),
    webSocket: {
      activeClients: wsService.getActiveClientsCount()
    }
  });
});

// Periodic SQLite Incremental Vacuum & Old Backup Cleanup (Maintenance Proposals 13 & 32)
function runScheduledMaintenance() {
  try {
    db.exec('PRAGMA incremental_vacuum(500);');
    logger.info('Scheduled incremental SQLite vacuum executed', 'Maintenance');

    const backupDir = path.join(__dirname, '../backups');
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir);
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      for (const file of files) {
        if (file.endsWith('.db')) {
          const filePath = path.join(backupDir, file);
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < thirtyDaysAgo) {
            fs.unlinkSync(filePath);
            logger.info(`Pruned expired database backup: ${file}`, 'BackupRotation');
          }
        }
      }
    }
  } catch (err: any) {
    logger.error(`Scheduled maintenance error: ${err.message}`, 'Maintenance');
  }
}

// Run maintenance once on boot and periodically
setTimeout(runScheduledMaintenance, 10000);

// RFC 7807 Centralized Error Handling Middleware (Maintenance Proposal 18)
app.use(globalErrorHandler);

server.listen(PORT, () => {
  logger.info(`====================================================`, 'Server');
  logger.info(`  MODULAR MOBILE ERP 2.0 (ENTERPRISE EDITION) ONLINE `, 'Server');
  logger.info(`  Local Endpoint: http://localhost:${PORT}          `, 'Server');
  logger.info(`  API Docs:       http://localhost:${PORT}/api/docs `, 'Server');
  logger.info(`  Health Check:   http://localhost:${PORT}/api/health`, 'Server');
  logger.info(`  WebSocket:      ws://localhost:${PORT}/ws         `, 'Server');
  logger.info(`  Status: READY for Desktop, Web & Mobile clients   `, 'Server');
  logger.info(`====================================================`, 'Server');
});
