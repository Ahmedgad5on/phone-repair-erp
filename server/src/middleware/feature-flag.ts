import { Request, Response, NextFunction } from 'express';
import db from '../db/database';

export type SupportedModuleFlag = 
  | 'enable_repair' 
  | 'enable_retail' 
  | 'enable_spare_parts' 
  | 'enable_fintech'
  | 'enable_accounting'
  | 'enable_inventory'
  | 'enable_hr'
  | 'enable_appointments'
  | 'enable_ai'
  | 'enable_amc';

const MODULE_FLAG_MAP: Record<string, string> = {
  RepairLabModule: 'enable_repair',
  repair: 'enable_repair',
  RetailPOSModule: 'enable_retail',
  retail: 'enable_retail',
  pos: 'enable_retail',
  SparePartsModule: 'enable_spare_parts',
  'spare-parts': 'enable_spare_parts',
  FintechCashModule: 'enable_fintech',
  fintech: 'enable_fintech',
  AccountingModule: 'enable_accounting',
  accounting: 'enable_accounting',
  InventoryModule: 'enable_inventory',
  inventory: 'enable_inventory',
  HRModule: 'enable_hr',
  hr: 'enable_hr',
  AppointmentsModule: 'enable_appointments',
  appointments: 'enable_appointments',
  AiModule: 'enable_ai',
  ai: 'enable_ai',
  AmcModule: 'enable_amc',
  amc: 'enable_amc'
};

/**
 * requireModule Feature-Flag Guard Middleware
 * 
 * Verifies module availability across:
 * 1. Business rules engine (IF-THEN dynamic disables)
 * 2. Store-level modular configuration flags
 * 
 * Returns HTTP 503 (Service Unavailable) when disabled:
 * { error: `Module ${moduleName} is disabled`, code: 'MODULE_DISABLED', module: moduleName }
 */
export function requireModule(moduleFlagOrName: string, explicitModuleName?: string) {
  const moduleName = explicitModuleName || moduleFlagOrName;
  const moduleFlag = explicitModuleName 
    ? moduleFlagOrName 
    : (MODULE_FLAG_MAP[moduleFlagOrName] || `enable_${moduleFlagOrName.toLowerCase()}`);

  return (_req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Check dynamic business rules engine
      const ruleRow = db.prepare(`
        SELECT * FROM business_rules 
        WHERE is_active = 1 
          AND (
            (action_type = 'DISABLE_MODULE' AND (action_payload LIKE ? OR rule_name LIKE ?))
            OR (event_type = 'MODULE_ACCESS' AND action_type = 'BLOCK' AND action_payload LIKE ?)
          )
        LIMIT 1
      `).get(`%${moduleName}%`, `%${moduleName}%`, `%${moduleName}%`) as any;

      if (ruleRow) {
        return res.status(503).json({
          error: `Module ${moduleName} is disabled`,
          code: 'MODULE_DISABLED',
          module: moduleName
        });
      }

      // 2. Check store modular settings
      const store = db.prepare('SELECT * FROM stores LIMIT 1').get() as any;
      if (!store) {
        return res.status(500).json({ error: 'Store not configured' });
      }

      if (moduleFlag && store[moduleFlag] === 0) {
        return res.status(503).json({
          error: `Module ${moduleName} is disabled`,
          code: 'MODULE_DISABLED',
          module: moduleName
        });
      }

      next();
    } catch (err: any) {
      next(err);
    }
  };
}

export default requireModule;
