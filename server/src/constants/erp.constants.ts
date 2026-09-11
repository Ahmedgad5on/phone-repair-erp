export const ERP_CONSTANTS = {
  // SLA Turnaround Time Limits (in minutes)
  SLA: {
    NORMAL_MINUTES: 1440, // 24 Hours
    URGENT_MINUTES: 240,  // 4 Hours
    VIP_MINUTES: 120      // 2 Hours
  },

  // Fintech & E-Wallet Thresholds
  FINTECH: {
    REGULATORY_LOCK_RATIO: 0.95, // 95% of daily/monthly limit triggers auto-lock
    AML_FLAG_THRESHOLD_EGP: 15000, // Anti-Money Laundering flag for high cash transactions
    DEFAULT_COMMISSION_EGP: 15
  },

  // Loyalty Program
  LOYALTY: {
    SPEND_PER_POINT: 100, // 100 EGP = 1 Point
    POINT_REDEMPTION_VALUE_EGP: 1.0 // 1 Point = 1 EGP discount
  },

  // Stock Aging
  INVENTORY: {
    AGING_THRESHOLD_DAYS: 60,
    DEFAULT_MIN_STOCK_ALERT: 2
  },

  // Rate Limiting
  RATE_LIMIT: {
    AUTH_WINDOW_MS: 60 * 1000, // 1 minute
    AUTH_MAX_ATTEMPTS: 5,       // 5 requests per minute
    FINTECH_TRANSFER_WINDOW_MS: 60 * 1000, // 1 minute
    FINTECH_TRANSFER_MAX_REQUESTS: 10,     // 10 requests per minute
    REPAIR_ESTIMATE_WINDOW_MS: 60 * 60 * 1000, // 1 hour
    REPAIR_ESTIMATE_MAX_REQUESTS: 20,          // 20 requests per hour
    GENERAL_WINDOW_MS: 15 * 60 * 1000,
    GENERAL_MAX_REQUESTS: 1000
  },

  // Security
  SECURITY: {
    BCRYPT_SALT_ROUNDS: 12,
    TOKEN_EXPIRY: '7d'
  }
} as const;
