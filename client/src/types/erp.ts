export interface Store {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  enable_repair: number;
  enable_retail: number;
  enable_spare_parts: number;
  enable_fintech: number;
  receipt_header?: string;
  receipt_footer?: string;
  google_maps_url?: string;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: 'SuperAdmin' | 'Manager' | 'Cashier' | 'Salesperson' | 'Receptionist' | 'MaintenanceEngineer';
  is_active: number;
  commission_rate: number;
}

export interface Shift {
  id: string;
  store_id: string;
  opened_by_user_id: string;
  closed_by_user_id?: string;
  opened_at: string;
  closed_at?: string;
  opening_cash: number;
  expected_cash: number;
  actual_cash?: number;
  cash_difference?: number;
  device_inventory_count: number;
  handover_notes?: string;
  status: 'OPEN' | 'CLOSED' | 'HANDED_OVER' | 'DISPUTED';
  opener_name?: string;
  closer_name?: string;
  accepted_by_user_id?: string;
  accepted_at?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  tag: 'VIP' | 'REGULAR' | 'HIGH_RETURN' | 'PROBLEMATIC';
  total_spent: number;
  notes?: string;
  google_review_prompted: number;
  created_at: string;
}

export interface RepairTicket {
  id: string;
  ticket_number: number;
  store_id: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_tag?: string;
  assigned_tech_id?: string;
  tech_name?: string;
  tech_commission_rate?: number;
  device_brand: string;
  device_model: string;
  imei_sn?: string;
  passcode?: string;
  pattern_code?: string;
  physical_condition?: string;
  checklist_json?: string;
  reported_defects: string;
  intake_media_url?: string;
  status: 'INTAKE' | 'DIAGNOSING' | 'WAITING_APPROVAL' | 'IN_REPAIR' | 'READY' | 'DELIVERED' | 'CANCELLED';
  priority: 'NORMAL' | 'URGENT' | 'VIP';
  estimated_cost: number;
  labor_charge: number;
  parts_cost: number;
  tech_commission: number;
  sla_deadline?: string;
  tat_minutes: number;
  release_otp: string;
  otp_verified: number;
  customer_signature?: string;
  created_at: string;
  completed_at?: string;
  delivered_at?: string;
}

export interface Item {
  id: string;
  store_id: string;
  sku: string;
  barcode?: string;
  name: string;
  category: 'PHONE' | 'ACCESSORY' | 'SPARE_PART' | 'OTHER';
  quality_grade?: 'SERVICE_PACK' | 'ORIGINAL_PULL' | 'OLED' | 'INCELL' | 'REFURBISHED' | 'AAA' | 'COPY';
  purchase_price: number;
  wholesale_price: number;
  retail_price: number;
  bulk_price: number;
  stock_quantity: number;
  min_limit: number;
  warranty_days: number;
  last_sold_date?: string;
  compatible_models?: string;
  days_idle?: number;
}

export interface ImeiRecord {
  id: string;
  item_id: string;
  imei: string;
  status: 'IN_STOCK' | 'DRAFT_SALE' | 'SOLD' | 'RETURNED' | 'DEFECTIVE';
  battery_health: number;
  color?: string;
  storage?: string;
  condition: string;
  purchase_date: string;
  sold_date?: string;
}

export interface Sale {
  id: string;
  invoice_number: number;
  store_id: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  salesperson_id?: string;
  salesperson_name?: string;
  cashier_id?: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: string;
  status: 'DRAFT' | 'COMPLETED' | 'VOID';
  escpos_receipt_text?: string;
  created_at: string;
}

export interface MissingDemand {
  id: string;
  item_name_or_query: string;
  customer_phone?: string;
  request_count: number;
  suggested_po_status: 'PENDING' | 'PO_CREATED' | 'IGNORED';
  notes?: string;
  created_at: string;
  last_requested_at: string;
}

export interface CompatibilityMapping {
  id: string;
  item_id: string;
  part_name: string;
  sku: string;
  quality_grade: string;
  target_brand: string;
  target_model: string;
  wholesale_price: number;
  retail_price: number;
  bulk_price: number;
  stock_quantity: number;
  notes?: string;
}

export interface RmaTicket {
  id: string;
  item_id: string;
  item_name: string;
  item_sku: string;
  quality_grade: string;
  vendor_name: string;
  security_sticker_intact: number;
  soldering_trace_detected: number;
  defect_reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REFUNDED';
  vendor_batch_code?: string;
  created_at: string;
}

export interface FintechWallet {
  id: string;
  provider_name: 'VODAFONE_CASH' | 'INSTAPAY' | 'FAWRY' | 'AMAN' | 'ETISALAT_CASH' | 'ORANGE_CASH';
  account_number: string;
  current_balance: number;
  daily_limit: number;
  daily_usage: number;
  monthly_limit: number;
  monthly_usage: number;
  is_locked: number;
  dailyPercentage: number;
  monthlyPercentage: number;
  nearLimit: boolean;
}

export interface FintechTransaction {
  id: string;
  wallet_id: string;
  wallet_provider: string;
  trans_type: 'CASH_IN' | 'CASH_OUT';
  amount: number;
  commission: number;
  sender_receiver_phone: string;
  reference_tx_id: string;
  national_id?: string;
  status: string;
  created_at: string;
}

export interface ScrapItem {
  id: string;
  donor_device_model: string;
  donor_imei?: string;
  part_name: string;
  condition_grade: string;
  estimated_value: number;
  barcode_label: string;
  status: string;
  created_at: string;
}

export interface DiagnosticsItem {
  id: string;
  device_brand: string;
  device_model: string;
  symptom: string;
  schematic_reference?: string;
  diode_readings?: string;
  diagnostic_steps: string;
  ai_prompt_hint?: string;
}
