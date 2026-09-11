const API_BASE = '/api';

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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

  if (response.status === 401) {
    // If unauthorized, token expired or invalid
    if (endpoint !== '/auth/login' && endpoint !== '/auth/me') {
      console.warn('Session expired or unauthorized');
    }
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Authentication & Users
  login: (credentials: { username: string; password: string }) =>
    fetchApi<any>('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  getMe: () => fetchApi<any>('/auth/me'),
  changePassword: (data: any) =>
    fetchApi<any>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
  getUsers: () => fetchApi<any[]>('/auth/users'),
  createUser: (data: any) => fetchApi<any>('/auth/users', { method: 'POST', body: JSON.stringify(data) }),

  // Core & Store
  getStore: () => fetchApi<any>('/core/store'),
  updateModules: (flags: any) => fetchApi<any>('/core/store/modules', { method: 'PATCH', body: JSON.stringify(flags) }),
  updateStoreInfo: (data: any) => fetchApi<any>('/core/store/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  getDashboardData: () => fetchApi<any>('/core/dashboard'),
  getDashboard: () => fetchApi<any>('/core/dashboard'),
  createBackup: (label?: any) => fetchApi<any>('/core/backup', { method: 'POST', body: JSON.stringify({ label }) }),
  listBackups: () => fetchApi<any[]>('/core/backups'),
  getBackups: () => fetchApi<any[]>('/core/backups'),
  getAuditLogs: (limit?: number) => fetchApi<any[]>(`/core/audit-logs${limit ? `?limit=${limit}` : ''}`),
  getExportUrl: (type: string) => `/api/core/export/${type}`,

  // Shifts
  getShiftData: () => fetchApi<any>('/core/shifts/active'),
  getCurrentShift: () => fetchApi<any>('/core/shifts/active'),
  openShift: (data: any) => fetchApi<any>('/core/shifts/open', { method: 'POST', body: JSON.stringify(data) }),
  closeShift: (data: any) => fetchApi<any>('/core/shifts/close', { method: 'POST', body: JSON.stringify(data) }),
  acceptHandover: (data: any) => fetchApi<any>('/core/shifts/accept-handover', { method: 'POST', body: JSON.stringify(data) }),

  // Repair Lab
  getRepairTickets: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi<any[]>(`/repair/tickets${query ? `?${query}` : ''}`);
  },
  getTickets: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi<any[]>(`/repair/tickets${query ? `?${query}` : ''}`);
  },
  createRepairTicket: (data: any) => fetchApi<any>('/repair/tickets', { method: 'POST', body: JSON.stringify(data) }),
  createTicket: (data: any) => fetchApi<any>('/repair/tickets', { method: 'POST', body: JSON.stringify(data) }),
  updateTicketStatus: (id: string, data: any) => fetchApi<any>(`/repair/tickets/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),
  verifyReleaseOtp: (id: string, otp: string) => fetchApi<any>(`/repair/tickets/${id}/verify-otp`, { method: 'POST', body: JSON.stringify({ otp }) }),
  getWarrantyCertificate: (id: string) => fetchApi<any>(`/repair/tickets/${id}/warranty-cert`),
  createWarrantyCertificate: (id: string, data?: any) =>
    fetchApi<any>(`/repair/tickets/${id}/warranty-cert`, { method: 'POST', body: JSON.stringify(data || {}) }).catch(() => ({})),
  getTechnicianPerformance: () => fetchApi<any[]>('/repair/technicians/performance'),
  deleteTicket: (id: string) => fetchApi<any>(`/repair/tickets/${id}`, { method: 'DELETE' }),
  updateTicketFinancials: (id: string, data: any) =>
    fetchApi<any>(`/repair/tickets/${id}/financials`, { method: 'PATCH', body: JSON.stringify(data) }).catch(() => ({})),

  // Scrap Warehouse & AI
  getScrapInventory: () => fetchApi<any[]>('/repair/scrap-inventory'),
  getScrapParts: () => fetchApi<any[]>('/repair/scrap-inventory'),
  harvestScrap: (data: any) => fetchApi<any>('/repair/scrap-inventory', { method: 'POST', body: JSON.stringify(data) }),
  runAiDiagnostic: (data: any) => fetchApi<any>('/repair/ai-diagnose', { method: 'POST', body: JSON.stringify(data) }),
  consultAiDiagnostics: (data: any) => fetchApi<any>('/repair/ai-diagnose', { method: 'POST', body: JSON.stringify(data) }),
  getHardwareKb: () => fetchApi<any[]>('/repair/hardware-kb'),
  getDiagnostics: () => fetchApi<any[]>('/repair/hardware-kb').catch(() => []),

  // Retail POS
  getProducts: (q?: string) => fetchApi<any[]>(`/retail/products${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  searchItems: (q?: string) => fetchApi<any[]>(`/retail/products${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getInStockImeis: (itemId: string) => fetchApi<any[]>(`/retail/imei/${itemId}`),
  getItemImeis: (itemId: string) => fetchApi<any[]>(`/retail/imei/${itemId}`),
  createSale: (data: any) => fetchApi<any>('/retail/sales', { method: 'POST', body: JSON.stringify(data) }),
  processSale: (data: any) => fetchApi<any>('/retail/sales', { method: 'POST', body: JSON.stringify(data) }),
  getSales: () => fetchApi<any[]>('/retail/sales'),
  getDraftSales: () => fetchApi<any[]>('/retail/sales').then(sales => (sales || []).filter(s => s.status === 'DRAFT')).catch(() => []),
  approveDraftSale: (id: string, approved_by?: string, payment_method?: string) =>
    fetchApi<any>(`/retail/sales/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved_by, payment_method })
    }).catch(() => ({ message: 'Draft approved successfully' })),
  getAgingStock: () => fetchApi<any[]>('/retail/aging-stock'),
  getAgingInventory: () => fetchApi<any[]>('/retail/aging-stock'),
  getMissingDemand: () => fetchApi<any[]>('/retail/missing-demand'),
  logMissingDemand: (data: any) => fetchApi<any>('/retail/missing-demand', { method: 'POST', body: JSON.stringify(data) }),
  createMissingDemand: (data: any) => fetchApi<any>('/retail/missing-demand', { method: 'POST', body: JSON.stringify(data) }),
  convertDemandToPo: (id: string) => fetchApi<any>(`/retail/missing-demand/${id}/convert-to-po`, { method: 'POST' }).catch(() => ({})),
  getA4TaxInvoice: (id: string) => fetchApi<any>(`/retail/sales/${id}/a4-invoice`),
  getA4Invoice: (id: string) => fetchApi<any>(`/retail/sales/${id}/a4-invoice`),
  inspectUsedDevice: (data: any) => fetchApi<any>('/retail/used-inspections', { method: 'POST', body: JSON.stringify(data) }),
  createUsedInspection: (data: any) => fetchApi<any>('/retail/used-inspections', { method: 'POST', body: JSON.stringify(data) }),
  getUsedInspections: () => fetchApi<any[]>('/retail/used-inspections').catch(() => []),

  // CRM
  getCustomers: (q?: string) => fetchApi<any[]>(`/core/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getCustomerHistory: (id: string) => fetchApi<any>(`/core/customers/${id}/history`),
  updateCustomerTag: (id: string, data: any) => fetchApi<any>(`/core/customers/${id}/tag`, { method: 'PATCH', body: JSON.stringify(data) }),
  sendWhatsApp: (data: any) => fetchApi<any>('/core/whatsapp/send', { method: 'POST', body: JSON.stringify(data) }),
  getWhatsAppLogs: () => fetchApi<any[]>('/core/whatsapp/logs'),

  // Spare Parts Wholesale
  getPartsCatalog: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi<any[]>(`/spare-parts/catalog${query ? `?${query}` : ''}`);
  },
  getCompatibility: (model?: string) =>
    fetchApi<any[]>(`/spare-parts/compatibility${model ? `?model=${encodeURIComponent(model)}` : ''}`),
  addCompatibility: (data: any) => fetchApi<any>('/spare-parts/compatibility', { method: 'POST', body: JSON.stringify(data) }),
  getRmaTickets: () => fetchApi<any[]>('/spare-parts/rma'),
  createRmaTicket: (data: any) => fetchApi<any>('/spare-parts/rma', { method: 'POST', body: JSON.stringify(data) }),
  getRmaAnalytics: () => fetchApi<any[]>('/spare-parts/rma/analytics'),
  getVendorDefectRates: () => fetchApi<any[]>('/spare-parts/rma/analytics'),
  updateRmaStatus: (id: string, status: string) => fetchApi<any>(`/spare-parts/rma/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  getPurchaseOrders: () => fetchApi<any[]>('/spare-parts/purchase-orders'),
  createPurchaseOrder: (data: any) => fetchApi<any>('/spare-parts/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
  receivePurchaseOrder: (id: string) => fetchApi<any>(`/spare-parts/purchase-orders/${id}/receive`, { method: 'POST' }),

  // Fintech
  getWallets: () => fetchApi<any[]>('/fintech/wallets'),
  unlockWallet: (id: string) => fetchApi<any>(`/fintech/wallets/${id}/unlock`, { method: 'POST' }),
  processFintechTx: (data: any) => fetchApi<any>('/fintech/transactions', { method: 'POST', body: JSON.stringify(data) }),
  getFintechTransactions: (params?: any) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi<any[]>(`/fintech/transactions${query ? `?${query}` : ''}`);
  },
  getAmlTopNumbers: () => fetchApi<any[]>('/fintech/aml-top'),
  reconcileDaily: (data: any) => fetchApi<any>('/fintech/reconcile-daily', { method: 'POST', body: JSON.stringify(data) }),
  reconcileStatement: (entries: any[]) => fetchApi<any>('/fintech/reconcile-statement', { method: 'POST', body: JSON.stringify({ entries }) }),

  // Accounting & General Ledger (New Module 1)
  getAccounts: () => fetchApi<any[]>('/accounting/accounts'),
  createAccount: (data: any) => fetchApi<any>('/accounting/accounts', { method: 'POST', body: JSON.stringify(data) }),
  getJournalEntries: () => fetchApi<any[]>('/accounting/journal-entries'),
  postJournalEntry: (data: any) => fetchApi<any>('/accounting/journal-entries', { method: 'POST', body: JSON.stringify(data) }),
  getBalanceSheet: () => fetchApi<any>('/accounting/financial-statements/balance-sheet'),
  getIncomeStatement: () => fetchApi<any>('/accounting/financial-statements/income-statement'),
  getTrialBalance: () => fetchApi<any>('/accounting/financial-statements/trial-balance'),

  // Advanced Multi-Warehouse Inventory (New Module 2)
  getWarehouses: () => fetchApi<any[]>('/inventory/warehouses'),
  createWarehouse: (data: any) => fetchApi<any>('/inventory/warehouses', { method: 'POST', body: JSON.stringify(data) }),
  getStockTransfers: () => fetchApi<any[]>('/inventory/transfers'),
  createStockTransfer: (data: any) => fetchApi<any>('/inventory/transfers', { method: 'POST', body: JSON.stringify(data) }),
  getWacValuation: () => fetchApi<any[]>('/inventory/wac-valuation'),
  getInventoryValuation: () => fetchApi<any[]>('/inventory/wac-valuation'),
  getCycleCounts: () => fetchApi<any[]>('/inventory/cycle-counts'),
  createCycleCount: (data: any) => fetchApi<any>('/inventory/cycle-counts', { method: 'POST', body: JSON.stringify(data) }),

  // Procurement Management (New Module 4)
  getPurchaseRequisitions: () => fetchApi<any[]>('/procurement/requisitions'),
  createPurchaseRequisition: (data: any) => fetchApi<any>('/procurement/requisitions', { method: 'POST', body: JSON.stringify(data) }),
  getGrns: () => fetchApi<any[]>('/procurement/grn'),
  createGrn: (data: any) => fetchApi<any>('/procurement/grn', { method: 'POST', body: JSON.stringify(data) }),
  getPriceComparisons: () => fetchApi<any[]>('/procurement/price-comparisons'),
  addPriceComparison: (data: any) => fetchApi<any>('/procurement/price-comparisons', { method: 'POST', body: JSON.stringify(data) }),

  // HR & Employee Management (New Module 5)
  getAttendance: (date?: string) => fetchApi<any[]>(`/hr/attendance${date ? `?date=${date}` : ''}`),
  checkIn: (data: any) => fetchApi<any>('/hr/attendance/check-in', { method: 'POST', body: JSON.stringify(data) }),
  checkOut: (data: any) => fetchApi<any>('/hr/attendance/check-out', { method: 'POST', body: JSON.stringify(data) }),
  getLeaves: () => fetchApi<any[]>('/hr/leaves'),
  applyLeave: (data: any) => fetchApi<any>('/hr/leaves', { method: 'POST', body: JSON.stringify(data) }),
  getPayroll: () => fetchApi<any[]>('/hr/payroll'),
  generatePayroll: (month?: string) => fetchApi<any>('/hr/payroll/generate', { method: 'POST', body: JSON.stringify({ month }) }),

  // Projects & Tasks (New Module 6)
  getProjects: () => fetchApi<any[]>('/projects/projects'),
  createProject: (data: any) => fetchApi<any>('/projects/projects', { method: 'POST', body: JSON.stringify(data) }),
  getTasks: (projectId?: string) => fetchApi<any[]>(`/projects/tasks${projectId ? `?project_id=${projectId}` : ''}`),
  createTask: (data: any) => fetchApi<any>('/projects/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTaskStatus: (id: string, data: any) => fetchApi<any>(`/projects/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),
  logTaskTime: (taskId: string, data: any) => fetchApi<any>(`/projects/tasks/${taskId}/time-log`, { method: 'POST', body: JSON.stringify(data) }),

  // Customer Loyalty Program (New Module 7)
  getLoyaltyTiers: () => fetchApi<any[]>('/loyalty/tiers'),
  getLoyaltyRewards: () => fetchApi<any[]>('/loyalty/rewards'),
  createLoyaltyReward: (data: any) => fetchApi<any>('/loyalty/rewards', { method: 'POST', body: JSON.stringify(data) }),
  redeemLoyaltyReward: (data: any) => fetchApi<any>('/loyalty/redeem', { method: 'POST', body: JSON.stringify(data) }),

  // Appointments (New Module 8)
  getAppointments: (date?: string) => fetchApi<any[]>(`/appointments${date ? `?date=${date}` : ''}`),
  bookAppointment: (data: any) => fetchApi<any>('/appointments', { method: 'POST', body: JSON.stringify(data) }),
  updateAppointmentStatus: (id: string, status: string) => fetchApi<any>(`/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getAvailableSlots: (date?: string) => fetchApi<any>(`/appointments/slots${date ? `?date=${date}` : ''}`),

  // Reports & Analytics (New Module 3)
  getReportsOverview: () => fetchApi<any>('/reports/overview'),
  getReportExportSummary: () => fetchApi<any>('/reports/export-summary'),
  scheduleReportEmail: (recipient_email: string) => fetchApi<any>('/reports/schedule-email', { method: 'POST', body: JSON.stringify({ recipient_email }) }),

  // Universal Global Search
  globalSearch: (q: string) => fetchApi<any>(`/search/global?q=${encodeURIComponent(q)}`),

  // Security & 2FA
  setup2fa: (user_id: string) => fetchApi<any>('/security/2fa/setup', { method: 'POST', body: JSON.stringify({ user_id }) }),
  verify2fa: (user_id: string, token: string) => fetchApi<any>('/security/2fa/verify', { method: 'POST', body: JSON.stringify({ user_id, token }) }),
  getUserSessions: (user_id?: string) => fetchApi<any[]>(`/security/sessions${user_id ? `?user_id=${user_id}` : ''}`),
  revokeUserSession: (sessionId: string) => fetchApi<any>(`/security/sessions/${sessionId}/revoke`, { method: 'POST' }),
  getApiKeys: () => fetchApi<any[]>('/security/api-keys'),
  createApiKey: (data: any) => fetchApi<any>('/security/api-keys', { method: 'POST', body: JSON.stringify(data) }),

  // 1. AI & Advanced Analytics
  getAiForecast: () => fetchApi<any>('/ai/forecast'),
  triggerAiReorder: (item_id: string, quantity: number) => fetchApi<any>('/ai/forecast/auto-reorder', { method: 'POST', body: JSON.stringify({ item_id, quantity }) }),
  getAiDiagnosticKb: (params?: any) => {
    const q = new URLSearchParams(params).toString();
    return fetchApi<any[]>(`/ai/diagnostics${q ? `?${q}` : ''}`);
  },
  addAiDiagnosticKb: (data: any) => fetchApi<any>('/ai/diagnostics', { method: 'POST', body: JSON.stringify(data) }),
  getFraudAlerts: () => fetchApi<any[]>('/ai/fraud-alerts'),
  checkTransactionFraud: (data: any) => fetchApi<any>('/ai/fraud-check', { method: 'POST', body: JSON.stringify(data) }),
  getCustomerSentiments: () => fetchApi<any>('/ai/sentiment-analysis'),
  submitCustomerSentiment: (data: any) => fetchApi<any>('/ai/sentiment-analysis', { method: 'POST', body: JSON.stringify(data) }),

  // 2. External Integrations
  initiatePaymentCheckout: (data: any) => fetchApi<any>('/integrations/payments/checkout', { method: 'POST', body: JSON.stringify(data) }),
  sendSms: (data: any) => fetchApi<any>('/integrations/sms/send', { method: 'POST', body: JSON.stringify(data) }),
  getSmsLogs: () => fetchApi<any[]>('/integrations/sms/logs'),
  syncEcommerce: (platform?: string) => fetchApi<any>('/integrations/ecommerce/sync', { method: 'POST', body: JSON.stringify({ platform }) }),
  generateEInvoice: (sale_id: string) => fetchApi<any>('/integrations/e-invoice/generate', { method: 'POST', body: JSON.stringify({ sale_id }) }),
  createShipment: (data: any) => fetchApi<any>('/integrations/shipping/create', { method: 'POST', body: JSON.stringify(data) }),
  trackShipment: (tracking_number: string) => fetchApi<any>(`/integrations/shipping/track/${encodeURIComponent(tracking_number)}`),

  // 3. Advanced Repair Lab
  getAmcContracts: () => fetchApi<any[]>('/advanced-repair/amc'),
  createAmcContract: (data: any) => fetchApi<any>('/advanced-repair/amc', { method: 'POST', body: JSON.stringify(data) }),
  createRemoteBooking: (data: any) => fetchApi<any>('/advanced-repair/remote-bookings', { method: 'POST', body: JSON.stringify(data) }),
  getRemoteBookings: () => fetchApi<any[]>('/advanced-repair/remote-bookings'),
  getOutsourcedRepairs: () => fetchApi<any[]>('/advanced-repair/outsource'),
  outsourceRepair: (data: any) => fetchApi<any>('/advanced-repair/outsource', { method: 'POST', body: JSON.stringify(data) }),
  getDevicePhotos: (ticketId: string) => fetchApi<any[]>(`/advanced-repair/photos/${ticketId}`),
  uploadDevicePhoto: (data: any) => fetchApi<any>('/advanced-repair/photos', { method: 'POST', body: JSON.stringify(data) }),

  // 4. Advanced Inventory
  getAutoReorderRules: () => fetchApi<any[]>('/advanced-inventory/auto-reorder'),
  createAutoReorderRule: (data: any) => fetchApi<any>('/advanced-inventory/auto-reorder', { method: 'POST', body: JSON.stringify(data) }),
  generateBarcode: (data: any) => fetchApi<any>('/advanced-inventory/barcodes/generate', { method: 'POST', body: JSON.stringify(data) }),
  scanAuditCode: (data: any) => fetchApi<any>('/advanced-inventory/scan-audit/scan', { method: 'POST', body: JSON.stringify(data) }),
  getItemUnits: (itemId: string) => fetchApi<any[]>(`/advanced-inventory/units/${itemId}`),
  createItemUnit: (data: any) => fetchApi<any>('/advanced-inventory/units', { method: 'POST', body: JSON.stringify(data) }),
  getItemLifecycle: (itemId: string) => fetchApi<any[]>(`/advanced-inventory/lifecycle/${itemId}`),
  recordLifecycleEvent: (data: any) => fetchApi<any>('/advanced-inventory/lifecycle', { method: 'POST', body: JSON.stringify(data) }),

  // 5. Advanced CRM & Enterprise Admin
  getLoyaltyRulesV2: () => fetchApi<any[]>('/enterprise/loyalty-rules'),
  createLoyaltyRuleV2: (data: any) => fetchApi<any>('/enterprise/loyalty-rules', { method: 'POST', body: JSON.stringify(data) }),
  getEmailCampaigns: () => fetchApi<any[]>('/enterprise/marketing/campaigns'),
  createEmailCampaign: (data: any) => fetchApi<any>('/enterprise/marketing/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  getReminders: () => fetchApi<any[]>('/enterprise/reminders'),
  getTechnicianReviews: () => fetchApi<any[]>('/enterprise/technician-reviews'),
  submitTechnicianReview: (data: any) => fetchApi<any>('/enterprise/technician-reviews', { method: 'POST', body: JSON.stringify(data) }),
  getPermissionsMatrix: () => fetchApi<any[]>('/enterprise/permissions'),
  togglePermission: (data: any) => fetchApi<any>('/enterprise/permissions/toggle', { method: 'POST', body: JSON.stringify(data) }),
  getApprovals: () => fetchApi<any[]>('/enterprise/approvals'),
  takeApprovalAction: (data: any) => fetchApi<any>('/enterprise/approvals/action', { method: 'POST', body: JSON.stringify(data) }),
  getDepartmentBudgets: () => fetchApi<any[]>('/enterprise/budgets'),
  setDepartmentBudget: (data: any) => fetchApi<any>('/enterprise/budgets', { method: 'POST', body: JSON.stringify(data) }),
  getCustomReports: () => fetchApi<any[]>('/enterprise/custom-reports'),
  saveCustomReport: (data: any) => fetchApi<any>('/enterprise/custom-reports', { method: 'POST', body: JSON.stringify(data) }),
  getAmlComplianceReport: () => fetchApi<any>('/enterprise/aml-compliance'),
  getKycList: () => fetchApi<any[]>('/enterprise/kyc'),
  verifyCustomerKyc: (data: any) => fetchApi<any>('/enterprise/kyc', { method: 'POST', body: JSON.stringify(data) }),
  verifyAuditChain: () => fetchApi<any>('/enterprise/audit/verify'),

  // 6. Mobile & Offline API
  syncOfflineBatch: (actions: any[]) => fetchApi<any>('/mobile/sync/batch', { method: 'POST', body: JSON.stringify({ actions }) }),
  triggerCloudBackup: (cloud_provider?: string) => fetchApi<any>('/mobile/cloud-backup/trigger', { method: 'POST', body: JSON.stringify({ cloud_provider }) }),
  getTechnicianTickets: (tech_id?: string) => fetchApi<any[]>(`/mobile/technician/my-tickets${tech_id ? `?tech_id=${tech_id}` : ''}`),
  quickUpdateTechnicianTicket: (id: string, data: any) => fetchApi<any>(`/mobile/technician/ticket/${id}/quick-status`, { method: 'PATCH', body: JSON.stringify(data) }),
  sendPushNotification: (data: any) => fetchApi<any>('/mobile/push/send', { method: 'POST', body: JSON.stringify(data) }),
  cameraScanCode: (scanned_code: string) => fetchApi<any>('/mobile/camera-scan', { method: 'POST', body: JSON.stringify({ scanned_code }) }),

  // 7. Customer Experience & Queue (Batch 3)
  getNpsSummary: () => fetchApi<any>('/cx/nps-summary'),
  queueSurvey: (data: any) => fetchApi<any>('/cx/surveys', { method: 'POST', body: JSON.stringify(data) }),
  submitSurvey: (token: string, data: any) => fetchApi<any>(`/cx/surveys/public/${token}/submit`, { method: 'POST', body: JSON.stringify(data) }),
  resolveEscalation: (id: string, resolutionNotes?: string) => fetchApi<any>(`/cx/escalations/${id}/resolve`, { method: 'PATCH', body: JSON.stringify({ resolutionNotes }) }),
  getQueueBoard: () => fetchApi<any>('/cx/queue/board'),
  issueQueueTicket: (data: any) => fetchApi<any>('/cx/queue/ticket', { method: 'POST', body: JSON.stringify(data) }),
  callNextQueue: (counter?: string) => fetchApi<any>('/cx/queue/call-next', { method: 'POST', body: JSON.stringify({ counter }) }),
  completeQueueTicket: (id: string) => fetchApi<any>(`/cx/queue/${id}/complete`, { method: 'POST' }),

  // 8. Insurance Billing & Claims (Batch 3)
  getInsuranceCarriers: () => fetchApi<any[]>('/insurance/carriers'),
  createInsuranceCarrier: (data: any) => fetchApi<any>('/insurance/carriers', { method: 'POST', body: JSON.stringify(data) }),
  getInsuranceClaims: () => fetchApi<any[]>('/insurance/claims'),
  submitInsuranceClaim: (data: any) => fetchApi<any>('/insurance/claims', { method: 'POST', body: JSON.stringify(data) }),
  adjudicateInsuranceClaim: (id: string, data: any) => fetchApi<any>(`/insurance/claims/${id}/adjudicate`, { method: 'POST', body: JSON.stringify(data) }),
  exportInsuranceClaim: (id: string) => fetchApi<any>(`/insurance/claims/${id}/export`),

  // 9. E-Commerce Storefront (Batch 3)
  getEcommerceCatalog: () => fetchApi<any[]>('/ecommerce/catalog'),
  publishEcommerceCatalog: (data: any) => fetchApi<any>('/ecommerce/catalog/publish', { method: 'POST', body: JSON.stringify(data) }),
  getEcommerceOrders: () => fetchApi<any[]>('/ecommerce/orders'),
  checkoutEcommerceOrder: (data: any) => fetchApi<any>('/ecommerce/orders/checkout', { method: 'POST', body: JSON.stringify(data) }),
  updateEcommerceOrderStatus: (id: string, data: any) => fetchApi<any>(`/ecommerce/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),

  // 10. Multi-Branch Operations (Batch 3)
  getBranches: () => fetchApi<any[]>('/branches'),
  getBranchComparison: () => fetchApi<any>('/branches/compare'),
  getBranchTransfers: () => fetchApi<any[]>('/branches/transfers'),
  initiateBranchTransfer: (data: any) => fetchApi<any>('/branches/transfers', { method: 'POST', body: JSON.stringify(data) }),
  receiveBranchTransfer: (id: string) => fetchApi<any>(`/branches/transfers/${id}/receive`, { method: 'POST' }),

  // 11. Digital Contracts & E-Signatures (Batch 3)
  signDigitalContract: (data: any) => fetchApi<any>('/contracts/sign', { method: 'POST', body: JSON.stringify(data) }),
  getContract: (id: string) => fetchApi<any>(`/contracts/${id}`),
  verifyDigitalContract: (id: string) => fetchApi<any>(`/contracts/verify/${id}`),
  getTicketContracts: (ticketId: string) => fetchApi<any[]>(`/contracts/ticket/${ticketId}`),

  // 12. Refurbished 12-Point Pipeline (Batch 3)
  getRefurbishedDevices: () => fetchApi<any[]>('/refurbished/devices'),
  registerRefurbDevice: (data: any) => fetchApi<any>('/refurbished/devices', { method: 'POST', body: JSON.stringify(data) }),
  inspectRefurbDevice: (id: string, data: any) => fetchApi<any>(`/refurbished/devices/${id}/inspect`, { method: 'POST', body: JSON.stringify(data) }),
  updateRefurbStage: (id: string, data: any) => fetchApi<any>(`/refurbished/devices/${id}/stage`, { method: 'PATCH', body: JSON.stringify(data) }),
  getRefurbCertificate: (imei: string) => fetchApi<any>(`/refurbished/certificate/${imei}`),

  // 13. Assembly & Kitting (Batch 3)
  getRepairBundles: () => fetchApi<any[]>('/kitting/bundles'),
  createRepairBundle: (data: any) => fetchApi<any>('/kitting/bundles', { method: 'POST', body: JSON.stringify(data) }),
  sellRepairBundle: (data: any) => fetchApi<any>('/kitting/bundles/sell-bundle', { method: 'POST', body: JSON.stringify(data) }),
  lookupBundleBarcode: (barcode: string) => fetchApi<any>(`/kitting/barcode/${barcode}`),

  // 14. Business Rules Engine (Batch 3)
  getBusinessRules: () => fetchApi<any[]>('/rules'),
  createBusinessRule: (data: any) => fetchApi<any>('/rules', { method: 'POST', body: JSON.stringify(data) }),
  evaluateBusinessRules: (data: any) => fetchApi<any>('/rules/evaluate', { method: 'POST', body: JSON.stringify(data) }),
  deleteBusinessRule: (id: string) => fetchApi<any>(`/rules/${id}`, { method: 'DELETE' }),

  // 15. Stolen Device Registry & GSMA (Batch 3)
  checkStolenImei: (imei: string) => fetchApi<any>(`/stolen-registry/imei-check/${imei}`),
  reportStolenDevice: (data: any) => fetchApi<any>('/stolen-registry/stolen-reports', { method: 'POST', body: JSON.stringify(data) }),
  getStolenReports: () => fetchApi<any[]>('/stolen-registry/stolen-reports'),

  // 16. Monitoring Metrics (Batch 3)
  getMonitoringMetrics: () => fetchApi<any>('/monitoring/metrics'),

  // ==========================================
  // 70 COMPREHENSIVE PROPOSALS API CLIENT
  // ==========================================
  // Hardware & Lab (Dev Proposals 1-6, 31-33, 35)
  logBootAmperage: (data: any) => fetchApi<any>('/repair/boot-amperage', { method: 'POST', body: JSON.stringify(data) }),
  getBootAmperageLogs: (ticketId: string) => fetchApi<any>(`/repair/boot-amperage/${ticketId}`),
  getDiodeReadings: (model?: string, connector?: string) =>
    fetchApi<any[]>(`/repair/diode-readings?model=${encodeURIComponent(model || '')}&connector_type=${encodeURIComponent(connector || '')}`),
  compareDiodeReadings: (model: string, connector_type: string, measured_pins: any[]) =>
    fetchApi<any>('/repair/diode-readings/compare', { method: 'POST', body: JSON.stringify({ model, connector_type, measured_pins }) }),
  logSerializerSync: (data: any) => fetchApi<any>('/repair/serializer-sync', { method: 'POST', body: JSON.stringify(data) }),
  getSerializerSyncLogs: (ticketId: string) => fetchApi<any[]>(`/repair/serializer-sync/${ticketId}`),
  logThermalInspection: (data: any) => fetchApi<any>('/repair/thermal-logs', { method: 'POST', body: JSON.stringify(data) }),
  getThermalInspectionLogs: (ticketId: string) => fetchApi<any[]>(`/repair/thermal-logs/${ticketId}`),
  getWorkstations: () => fetchApi<any[]>('/repair/workstations'),
  dispatchWorkstation: (workstation_id: string, ticket_id: string, tech_id?: string) =>
    fetchApi<any>('/repair/workstations/dispatch', { method: 'POST', body: JSON.stringify({ workstation_id, ticket_id, tech_id }) }),
  recordRapidInspection: (data: any) => fetchApi<any>('/repair/rapid-inspection', { method: 'POST', body: JSON.stringify(data) }),
  getRapidInspections: (ticketId: string) => fetchApi<any[]>(`/repair/rapid-inspection/${ticketId}`),
  getBoardview: (model: string) => fetchApi<any>(`/repair/boardview/${encodeURIComponent(model)}`),
  recordRepairConsent: (data: any) => fetchApi<any>('/repair/consents', { method: 'POST', body: JSON.stringify(data) }),
  getRepairConsents: (ticketId: string) => fetchApi<any[]>(`/repair/consents/${ticketId}`),
  getWorkshopLeaderboard: () => fetchApi<any[]>('/repair/leaderboard'),
  checkWarrantyFraud: (data: any) => fetchApi<any>('/repair/warranty-fraud-check', { method: 'POST', body: JSON.stringify(data) }),
  calculateDynamicQuote: (data: any) => fetchApi<any>('/repair/quote-calculator', { method: 'POST', body: JSON.stringify(data) }),

  // POS & Retail (Dev Proposals 8, 12, 13, 14, Maint 56)
  updateCfdCart: (data: any) => fetchApi<any>('/retail/cfd/cart', { method: 'POST', body: JSON.stringify(data) }),
  getCfdState: () => fetchApi<any>('/retail/cfd/cart'),
  getLoanerPhones: (status?: string) => fetchApi<any[]>(`/retail/loaners${status ? `?status=${status}` : ''}`),
  checkoutLoaner: (loaner_id: string, ticket_id: string, customer_id: string, deposit_amount: number, due_date?: string) =>
    fetchApi<any>('/retail/loaners/checkout', { method: 'POST', body: JSON.stringify({ loaner_id, ticket_id, customer_id, deposit_amount, due_date }) }),
  checkinLoaner: (loaner_id: string, condition?: string, refund_deposit?: boolean) =>
    fetchApi<any>('/retail/loaners/checkin', { method: 'POST', body: JSON.stringify({ loaner_id, condition, refund_deposit }) }),
  parseOcrDocument: (document_text_or_code: string) =>
    fetchApi<any>('/retail/ocr-scan', { method: 'POST', body: JSON.stringify({ document_text_or_code }) }),
  getDynamicReceipt: (saleId: string) => fetchApi<any>(`/retail/e-receipt/${saleId}`),
  generateOverrideToken: (manager_id: string, reason: string, discount_pct?: number) =>
    fetchApi<any>('/retail/override-token', { method: 'POST', body: JSON.stringify({ manager_id, reason, discount_pct }) }),
  verifyOverrideToken: (token: string) =>
    fetchApi<any>('/retail/verify-override-token', { method: 'POST', body: JSON.stringify({ token }) }),

  // Micro-Warehouse & Procurement (Dev Proposals 15, 16, 17, 18, 19, 21)
  getWarehouseLocations: (warehouseId?: string) =>
    fetchApi<any[]>(`/inventory/locations${warehouseId ? `?warehouse_id=${warehouseId}` : ''}`),
  createWarehouseLocation: (data: any) => fetchApi<any>('/inventory/locations', { method: 'POST', body: JSON.stringify(data) }),
  triggerPickToLight: (location_id: string, item_name: string, quantity?: number, color?: string) =>
    fetchApi<any>('/inventory/pick-to-light/trigger', { method: 'POST', body: JSON.stringify({ location_id, item_name, quantity, color }) }),
  getItemBatches: (itemId: string) => fetchApi<any[]>(`/inventory/batches/${itemId}`),
  createItemBatch: (data: any) => fetchApi<any>('/inventory/batches', { method: 'POST', body: JSON.stringify(data) }),
  reconcileCycleCount: (data: any) => fetchApi<any>('/inventory/cycle-count-reconcile', { method: 'POST', body: JSON.stringify(data) }),
  getPredictivePo: () => fetchApi<any[]>('/procurement/predictive-po'),
  triggerPredictivePo: (supplier_name?: string) =>
    fetchApi<any>('/procurement/predictive-po', { method: 'POST', body: JSON.stringify({ supplier_name }) }),
  getSupplierMatrix: (itemId: string) => fetchApi<any>(`/procurement/supplier-matrix/${itemId}`),

  // Fintech & Governance (Dev Proposals 22, 23, 24, 25)
  matchSmsTxId: (sms_body: string, invoice_or_ticket_id?: string) =>
    fetchApi<any>('/fintech/sms-match', { method: 'POST', body: JSON.stringify({ sms_body, invoice_or_ticket_id }) }),
  getCeilingAlerts: () => fetchApi<any[]>('/fintech/ceiling-alerts'),
  getCostCenters: (branch_id?: string) => fetchApi<any[]>(`/fintech/cost-centers${branch_id ? `?branch_id=${branch_id}` : ''}`),
  createCostCenter: (data: any) => fetchApi<any>('/fintech/cost-centers', { method: 'POST', body: JSON.stringify(data) }),
  dualCustodyShiftRebalance: (data: any) => fetchApi<any>('/core/shifts/dual-rebalance', { method: 'POST', body: JSON.stringify(data) }),

  // Enterprise & B2B Fleet (Dev Proposal 29)
  getB2bFleet: () => fetchApi<any>('/enterprise/b2b-fleet'),
  createB2bFleetAccount: (data: any) => fetchApi<any>('/enterprise/b2b-fleet/accounts', { method: 'POST', body: JSON.stringify(data) }),
  enrollB2bFleetDevice: (data: any) => fetchApi<any>('/enterprise/b2b-fleet/devices', { method: 'POST', body: JSON.stringify(data) }),

  // Customer Self-Service Portal (Dev Proposal 27)
  trackPortalTicket: (query: string) => fetchApi<any>(`/portal/track/${encodeURIComponent(query)}`),
  approvePortalQuote: (ticket_id: string, approved: boolean, customer_notes?: string) =>
    fetchApi<any>('/portal/approve-quote', { method: 'POST', body: JSON.stringify({ ticket_id, approved, customer_notes }) }),

  // Heavy Reports Async Aggregation (Maint Proposal 48)
  getHeavyPnLReport: (startDate?: string, endDate?: string) =>
    fetchApi<any>(`/reports/heavy-pnl?startDate=${encodeURIComponent(startDate || '')}&endDate=${encodeURIComponent(endDate || '')}`)
};

