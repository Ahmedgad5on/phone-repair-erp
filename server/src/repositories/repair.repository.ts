import db from '../db/database';
import { v4 as uuidv4 } from 'uuid';

export interface BootAmperageLog {
  id?: string;
  ticket_id: string;
  sample_ms: number;
  current_ma: number;
  voltage_v: number;
  stage?: string;
  diagnosis_tag?: string;
}

export interface DiodeReading {
  id?: string;
  model: string;
  connector_type: string;
  pin_number: number;
  pin_name: string;
  expected_value: number;
  tolerance_pct?: number;
  line_type?: string;
  notes?: string;
}

export interface SerializerSyncLog {
  id?: string;
  ticket_id: string;
  device_serial?: string;
  screen_mt_sn?: string;
  cover_code?: string;
  bms_sn?: string;
  cycle_count?: number;
  battery_health_pct?: number;
  programmer_model?: string;
  sync_status?: string;
}

export interface ThermalLog {
  id?: string;
  ticket_id: string;
  media_url: string;
  media_type?: string;
  max_temp_c: number;
  min_temp_c?: number;
  hot_spot_x?: number;
  hot_spot_y?: number;
  component_ref?: string;
  notes?: string;
}

export class RepairRepository {
  // Boot Amperage Curve Logger (Dev Proposal 1)
  static logBootAmperage(log: BootAmperageLog): string {
    const id = log.id || `amp-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT INTO boot_amperage_logs (id, ticket_id, sample_ms, current_ma, voltage_v, stage, diagnosis_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      log.ticket_id,
      log.sample_ms,
      log.current_ma,
      log.voltage_v,
      log.stage || 'BOOTING',
      log.diagnosis_tag || null
    );
    return id;
  }

  static getBootAmperageLogs(ticketId: string) {
    return db.prepare(`
      SELECT * FROM boot_amperage_logs
      WHERE ticket_id = ?
      ORDER BY sample_ms ASC
    `).all(ticketId);
  }

  static analyzeAmperageCurve(samples: Array<{ sample_ms: number; current_ma: number }>) {
    if (!samples || samples.length === 0) {
      return { pattern: 'UNKNOWN', confidence: 0, diagnosis: 'No samples provided' };
    }
    let maxCurrent = -Infinity;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].current_ma > maxCurrent) {
        maxCurrent = samples[i].current_ma;
      }
    }
    const initialCurrent = samples[0]?.current_ma || 0;
    const finalCurrent = samples[samples.length - 1]?.current_ma || 0;

    if (initialCurrent > 1500 || maxCurrent > 2000) {
      return {
        pattern: 'SHORT_TO_GROUND',
        confidence: 0.96,
        diagnosis: 'Immediate massive current spike detected. Main power rail (VDD_MAIN / VPH_PWR) shorted to ground. Check input filter capacitors and main PMIC.',
        recommendedAction: 'Apply thermal freeze spray or thermal camera at 1.2V current limit to spot smoking capacitor.'
      };
    }

    if (maxCurrent > 300 && maxCurrent < 900 && finalCurrent < 100) {
      return {
        pattern: 'PMIC_RESTART_LOOP',
        confidence: 0.88,
        diagnosis: 'Boot current cycles between 250mA and 750mA then resets. CPU secondary power rail or I2C communication failure.',
        recommendedAction: 'Measure I2C pull-up voltages (1.8V) on EEPROM, gas gauge, and charging IC.'
      };
    }

    if (maxCurrent > 180 && maxCurrent < 350 && Math.abs(finalCurrent - 220) < 50) {
      return {
        pattern: 'DFU_OR_NAND_FREEZE',
        confidence: 0.92,
        diagnosis: 'Current stabilizes indefinitely around 200-240mA without display initiation. Typical NAND flash corruption or missing kernel power.',
        recommendedAction: 'Connect to computer in Recovery/DFU mode to verify USB handshake and NAND communication.'
      };
    }

    return {
      pattern: 'NORMAL_BOOT_SEQUENCE',
      confidence: 0.94,
      diagnosis: 'Standard boot curve: 80mA standby -> 350mA CPU init -> 900mA display backlight ON -> 450mA idle.',
      recommendedAction: 'Power sequence normal. Proceed to functional software & display checks.'
    };
  }

  // Diode Mode Readings DB (Dev Proposal 2)
  static getDiodeReadings(model?: string, connectorType?: string) {
    let query = 'SELECT * FROM diode_readings WHERE 1=1';
    const params: any[] = [];
    if (model) {
      query += ' AND model LIKE ?';
      params.push(`%${model}%`);
    }
    if (connectorType) {
      query += ' AND connector_type = ?';
      params.push(connectorType);
    }
    query += ' ORDER BY connector_type ASC, pin_number ASC';
    return db.prepare(query).all(...params);
  }

  static compareDiodeReadings(model: string, connectorType: string, measuredPins: Array<{ pin_number: number; measured_value: number }>) {
    const references = db.prepare(`
      SELECT * FROM diode_readings
      WHERE model LIKE ? AND connector_type = ?
    `).all(`%${model}%`, connectorType) as DiodeReading[];

    const refMap = new Map<number, DiodeReading>();
    references.forEach(r => refMap.set(r.pin_number, r));

    const comparisons = measuredPins.map(m => {
      const ref = refMap.get(m.pin_number);
      if (!ref) {
        return { pin_number: m.pin_number, measured_value: m.measured_value, status: 'NO_REFERENCE' };
      }

      const expected = ref.expected_value;
      const tolerance = (ref.tolerance_pct || 15.0) / 100.0;
      const minVal = expected * (1 - tolerance);
      const maxVal = expected * (1 + tolerance);

      let status = 'PASS';
      if (expected === 0) {
        // Ground reference pin: should be <= 0.020V lead contact resistance
        if (m.measured_value > 0.02) {
          status = 'OPEN_GROUND';
        }
      } else if (m.measured_value <= 0.01 && expected > 0.05) {
        status = 'SHORT_TO_GND';
      } else if (m.measured_value >= 1.99 && expected < 1.5) {
        status = 'OPEN_LINE';
      } else if (m.measured_value < minVal) {
        status = 'VALUE_LOW';
      } else if (m.measured_value > maxVal) {
        status = 'VALUE_HIGH';
      }

      return {
        pin_number: m.pin_number,
        pin_name: ref.pin_name,
        line_type: ref.line_type,
        expected_value: expected,
        measured_value: m.measured_value,
        status,
        notes: ref.notes
      };
    });

    const isHealthy = comparisons.every(c => c.status === 'PASS');
    return { isHealthy, comparisons };
  }

  // TrueTone & BMS Serializer Sync (Dev Proposal 3)
  static recordSerializerSync(log: SerializerSyncLog): string {
    const id = log.id || `sync-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT INTO serializer_sync_logs (
        id, ticket_id, device_serial, screen_mt_sn, cover_code, bms_sn,
        cycle_count, battery_health_pct, programmer_model, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      log.ticket_id,
      log.device_serial || null,
      log.screen_mt_sn || null,
      log.cover_code || null,
      log.bms_sn || null,
      log.cycle_count || 0,
      log.battery_health_pct || 100,
      log.programmer_model || 'JCID-V1SE',
      log.sync_status || 'SUCCESS'
    );
    return id;
  }

  static getSerializerSyncLogs(ticketId: string) {
    return db.prepare('SELECT * FROM serializer_sync_logs WHERE ticket_id = ? ORDER BY synced_at DESC').all(ticketId);
  }

  // Thermal Logs (Dev Proposal 4)
  static recordThermalLog(log: ThermalLog): string {
    const id = log.id || `thm-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT INTO thermal_inspection_logs (
        id, ticket_id, media_url, media_type, max_temp_c, min_temp_c,
        hot_spot_x, hot_spot_y, component_ref, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      log.ticket_id,
      log.media_url,
      log.media_type || 'THERMAL',
      log.max_temp_c,
      log.min_temp_c || null,
      log.hot_spot_x || null,
      log.hot_spot_y || null,
      log.component_ref || null,
      log.notes || null
    );
    return id;
  }

  static getThermalLogs(ticketId: string) {
    return db.prepare('SELECT * FROM thermal_inspection_logs WHERE ticket_id = ? ORDER BY captured_at DESC').all(ticketId);
  }

  // Workstation Queue Dispatcher (Dev Proposal 5)
  static getWorkstations() {
    return db.prepare(`
      SELECT w.*, u.name as tech_name, t.ticket_number, t.device_brand, t.device_model
      FROM workstation_queues w
      LEFT JOIN users u ON w.assigned_tech_id = u.id
      LEFT JOIN repair_tickets t ON w.current_ticket_id = t.id
      ORDER BY w.workstation_code ASC
    `).all();
  }

  static dispatchTicketToWorkstation(workstationId: string, ticketId: string, techId?: string) {
    db.prepare(`
      UPDATE workstation_queues
      SET current_ticket_id = ?,
          assigned_tech_id = COALESCE(?, assigned_tech_id),
          status = 'BUSY',
          last_activity_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(ticketId, techId || null, workstationId);

    db.prepare(`
      UPDATE repair_tickets
      SET assigned_tech_id = COALESCE(?, assigned_tech_id),
          status = 'IN_PROGRESS'
      WHERE id = ?
    `).run(techId || null, ticketId);

    return { success: true, workstationId, ticketId };
  }

  // Rapid 24-Point Digital Inspection (Dev Proposal 6)
  static recordRapidInspection(data: {
    ticket_id: string;
    stage: 'PRE_REPAIR' | 'POST_REPAIR';
    checklist: Record<string, 'PASS' | 'FAIL' | 'ADVISORY' | 'NA'>;
    inspector_id?: string;
  }) {
    const id = `ins-${uuidv4().substring(0, 8)}`;
    const checklistJson = JSON.stringify(data.checklist);

    let passCount = 0;
    let failCount = 0;
    let advisoryCount = 0;

    for (const val of Object.values(data.checklist)) {
      if (val === 'PASS') passCount++;
      else if (val === 'FAIL') failCount++;
      else if (val === 'ADVISORY') advisoryCount++;
    }

    db.prepare(`
      INSERT INTO rapid_inspections (
        id, ticket_id, stage, checklist_json, pass_count, fail_count, advisory_count, inspector_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.ticket_id, data.stage, checklistJson, passCount, failCount, advisoryCount, data.inspector_id || null);

    return { id, passCount, failCount, advisoryCount };
  }

  static getRapidInspections(ticketId: string) {
    return db.prepare('SELECT * FROM rapid_inspections WHERE ticket_id = ? ORDER BY created_at DESC').all(ticketId);
  }

  // Audio/Video Disclaimer Consent (Dev Proposal 32)
  static recordConsent(data: { ticket_id: string; consent_type: string; media_url: string; transcription?: string; customer_agreed?: boolean }) {
    const id = `cns-${uuidv4().substring(0, 8)}`;
    db.prepare(`
      INSERT INTO repair_consents (id, ticket_id, consent_type, media_url, transcription, customer_agreed)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.ticket_id, data.consent_type, data.media_url, data.transcription || null, data.customer_agreed !== false ? 1 : 0);
    return id;
  }

  static getConsents(ticketId: string) {
    return db.prepare('SELECT * FROM repair_consents WHERE ticket_id = ? ORDER BY recorded_at DESC').all(ticketId);
  }
}
