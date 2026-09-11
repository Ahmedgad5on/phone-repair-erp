const API_BASE = '/api';

async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
    headers
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export interface DeadStockResponse {
  days_threshold: number;
  calculated_at: string;
  total_dead_items: number;
  total_dead_units: number;
  total_tied_capital: number;
  items: Array<{
    id: string;
    sku: string;
    barcode: string | null;
    name: string;
    category: string;
    quality_grade: string | null;
    stock_quantity: number;
    purchase_price: number;
    retail_price: number;
    total_tied_capital: number;
    last_sold_date: string | null;
    created_at: string;
    days_inactive: number;
  }>;
}

export interface SupplierScore {
  id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_display_name: string;
  on_time_rate: number;
  quality_rate: number;
  return_rate: number;
  total_orders: number;
  tier: string;
  last_updated: string;
}

export interface ItemCompatibility {
  id: string;
  item_id: string;
  device_brand: string;
  device_model: string;
  notes?: string;
  created_at: string;
}

export interface ReorderAnalysis {
  item_id: string;
  item_name: string;
  sku: string;
  category: string;
  stock_quantity: number;
  min_limit: number;
  current_reorder_point: number;
  avg_daily_usage: number;
  lead_time_days: number;
  safety_factor: number;
  calculated_reorder_point: number;
  reorder_needed: boolean;
  recommendation: string;
}

export interface FifoValuationResponse {
  valuation_method: string;
  calculated_at: string;
  total_units: number;
  total_fifo_value: number;
  total_retail_value: number;
  unrealized_gain_loss: number;
  items: Array<{
    id: string;
    sku: string;
    name: string;
    category: string;
    stock_quantity: number;
    cost_per_unit: number;
    total_fifo_value: number;
    retail_price: number;
    total_retail_value: number;
    unrealized_gain_loss: number;
    lots_breakdown: Array<{
      cost_price: number;
      quantity: number;
      effective_from: string;
      po_id: string | null;
    }>;
  }>;
}

export const inventoryApi = {
  // Dead Stock Identification (R3.2)
  getDeadStock: (days: number = 90) =>
    fetchWithAuth<DeadStockResponse>(`/inventory/reports/dead-stock?days=${days}`),

  markForClearance: (itemId: string, data: { discount_percent?: number; clearance_price?: number; note?: string }) =>
    fetchWithAuth<any>(`/inventory/items/${itemId}/clearance`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // Reorder Point Calculation (R3.3)
  getReorderAnalysis: (itemId: string) =>
    fetchWithAuth<ReorderAnalysis>(`/inventory/items/${itemId}/reorder-analysis`),

  runReorderCalculation: () =>
    fetchWithAuth<any>('/inventory/reorder-calculation/run', { method: 'POST' }),

  // Supplier Scorecards (R3.4)
  getSupplierScorecards: () =>
    fetchWithAuth<SupplierScore[]>('/procurement/suppliers/scorecard'),

  // Inter-Branch Stock Transfers (R3.5)
  getTransferRequests: () =>
    fetchWithAuth<any[]>('/inventory/transfers/requests'),

  createTransferRequest: (data: { from_branch_id: string; to_branch_id: string; item_id: string; quantity: number; notes?: string }) =>
    fetchWithAuth<any>('/inventory/transfers', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  approveTransfer: (id: string) =>
    fetchWithAuth<any>(`/inventory/transfers/${id}/approve`, {
      method: 'PATCH'
    }),

  rejectTransfer: (id: string) =>
    fetchWithAuth<any>(`/inventory/transfers/${id}/reject`, {
      method: 'PATCH'
    }),

  // FTS5 Item Search (R3.6)
  searchItemsFts: (q: string) =>
    fetchWithAuth<any[]>(`/inventory/items/search?q=${encodeURIComponent(q)}`),

  // FIFO Valuation (R3.9)
  getFifoValuation: () =>
    fetchWithAuth<FifoValuationResponse>('/inventory/reports/valuation?method=fifo'),

  // Part Compatibility (R3.10)
  getItemCompatibility: (itemId: string) =>
    fetchWithAuth<ItemCompatibility[]>(`/inventory/items/${itemId}/compatibility`),

  addItemCompatibility: (itemId: string, data: { device_brand: string; device_model: string; notes?: string }) =>
    fetchWithAuth<ItemCompatibility>(`/inventory/items/${itemId}/compatibility`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  deleteItemCompatibility: (itemId: string, compatId: string) =>
    fetchWithAuth<{ success: boolean }>(`/inventory/items/${itemId}/compatibility/${compatId}`, {
      method: 'DELETE'
    }),

  // GRN Rollback (R3.8)
  rollbackReceipt: (receiptId: string) =>
    fetchWithAuth<any>(`/procurement/receipts/${receiptId}/rollback`, {
      method: 'POST'
    })
};
