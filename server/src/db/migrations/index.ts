import type { Database } from 'better-sqlite3';
import { migration001, Migration } from './001_initial_extensions';
import { migration002 } from './002_repair_r1';
import { migration003 } from './003_retail_r2';
import { migration004 } from './004_inventory_r3';
import { migration005 } from './005_fintech_r4';
import { migration006 } from './006_security_constraints';
import { migration007 } from './007_repair_lab_25_ideas';
import { migration008 } from './008_retail_pos_25_ideas';
import { migration009 } from './009_spare_parts_wholesale_25_ideas';
import { migration010 } from './010_fintech_treasury_25_ideas';
import { migration011 } from './011_add_reserved_quantity_to_items';
import { migration012 } from './012_add_po_approval_columns';
import { migration013 } from './013_add_stocktake_freeze';

export type { Migration };

export const migrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013
];

export default migrations;
