// Fintech & Financial Management Shared Types & API helpers

export interface FintechWallet {
  id: string;
  store_id: string;
  provider_name: string;
  wallet_number: string;
  current_balance: number;
  daily_usage: number;
  daily_limit: number;
  monthly_usage: number;
  monthly_limit: number;
  is_locked: number | boolean;
  version?: number;
  dailyPercentage?: number;
  monthlyPercentage?: number;
  nearLimit?: boolean;
}

export interface FintechTransaction {
  id: string;
  wallet_id: string;
  wallet_provider: string;
  trans_type: 'CASH_IN' | 'CASH_OUT' | 'TRANSFER';
  amount: number;
  commission: number;
  sender_receiver_phone?: string;
  reference_tx_id?: string;
  national_id?: string;
  created_by_user_id: string;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  request_type: string;
  reference_id?: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  current_level: 'CASHIER' | 'MANAGER' | 'CFO';
  requested_by: string;
  approved_by?: string;
  reason?: string;
  created_at: string;
  updated_at?: string;
}

export interface Expense {
  id: string;
  expense_number: string;
  category: string;
  amount: number;
  tax_amount: number;
  currency: string;
  payment_method: string;
  receipt_url?: string;
  description: string;
  branch_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by?: string;
  journal_entry_id?: string;
  created_by: string;
  created_at: string;
}

export interface BankStatementEntry {
  id: string;
  statement_date: string;
  reference?: string;
  description: string;
  amount: number;
  matched_transaction_id?: string;
  match_status: 'MATCHED' | 'UNMATCHED';
  imported_at: string;
}

export interface CashflowDayProjection {
  day: number;
  date: string;
  inflows: number;
  outflows: number;
  net: number;
  projectedBalance: number;
  installmentsInflow: number;
  salesInflow: number;
  expensesOutflow: number;
  payablesOutflow: number;
}

export interface CashflowProjectionData {
  currentBalance: number;
  projectedEndBalance: number;
  minProjectedBalance: number;
  totalInflows: number;
  totalOutflows: number;
  netCashFlow: number;
  days: number;
  projection: CashflowDayProjection[];
}

export interface WithholdingTaxRule {
  id: string;
  supplier_type: string;
  rate: number;
  description: string;
  is_active: number;
}

export interface CustomerCreditInfo {
  customerId: string;
  customerName: string;
  phone: string;
  credit_limit: number;
  credit_used: number;
  available_credit: number;
  usage_percentage: number;
  isLimitReached: boolean;
}

// Local API Fetcher Helper
const API_BASE = '/api';

export async function fetchFintechApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}
