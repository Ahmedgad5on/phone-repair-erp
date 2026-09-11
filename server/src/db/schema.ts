import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const stores = sqliteTable("stores", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  currency: text("currency").default("USD"),
  timezone: text("timezone").default("UTC"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  featureFlags: text("feature_flags"), // JSON string
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  storeId: text("store_id").references(() => stores.id),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role", { enum: ["owner", "admin", "manager", "technician", "cashier", "viewer"] }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  storeId: text("store_id").references(() => stores.id),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  loyaltyTier: text("loyalty_tier").default("bronze"),
  creditLimit: integer("credit_limit").default(0),
  currentBalance: integer("current_balance").default(0),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  storeId: text("store_id").references(() => stores.id),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  category: text("category", { enum: ["PHONE", "ACCESSORY", "SPARE_PART"] }).notNull(),
  costPrice: integer("cost_price").notNull(),
  sellPrice: integer("sell_price").notNull(),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  minStock: integer("min_stock").default(0),
  barcode: text("barcode"),
  imei: text("imei"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const repairTickets = sqliteTable("repair_tickets", {
  id: text("id").primaryKey(),
  storeId: text("store_id").references(() => stores.id),
  customerId: text("customer_id").references(() => customers.id),
  ticketNumber: text("ticket_number").notNull().unique(),
  deviceBrand: text("device_brand").notNull(),
  deviceModel: text("device_model").notNull(),
  imei: text("imei"),
  issueDescription: text("issue_description").notNull(),
  status: text("status", {
    enum: ["received", "diagnosed", "awaiting_parts", "in_repair", "qa", "ready", "delivered", "cancelled"],
  }).notNull().default("received"),
  estimatedCost: integer("estimated_cost"),
  finalCost: integer("final_cost"),
  assignedTechnicianId: text("assigned_technician_id"),
  estimatedCompletion: text("estimated_completion"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sales = sqliteTable("sales", {
  id: text("id").primaryKey(),
  storeId: text("store_id").references(() => stores.id),
  customerId: text("customer_id").references(() => customers.id),
  userId: text("user_id").references(() => users.id),
  saleNumber: text("sale_number").notNull().unique(),
  subtotal: integer("subtotal").notNull(),
  taxAmount: integer("tax_amount").default(0),
  discountAmount: integer("discount_amount").default(0),
  total: integer("total").notNull(),
  paymentMethod: text("payment_method").notNull(),
  status: text("status", { enum: ["completed", "voided", "returned"] }).notNull().default("completed"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const fintechWallets = sqliteTable("fintech_wallets", {
  id: text("id").primaryKey(),
  storeId: text("store_id").references(() => stores.id),
  customerId: text("customer_id").references(() => customers.id),
  balance: integer("balance").notNull().default(0),
  version: integer("version").notNull().default(0), // Optimistic locking
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  storeId: text("store_id"),
  userId: text("user_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  oldValues: text("old_values"), // JSON
  newValues: text("new_values"), // JSON
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
});
