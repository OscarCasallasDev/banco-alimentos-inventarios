/**
 * Schema de base de datos — Drizzle ORM
 * Sistema de Gestión de Inventarios
 * Banco Arquidiocesano de Alimentos de Ibagué
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  decimal,
  date,
  timestamp,
  boolean,
  inet,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================
// ENUMS
// ============================================================

export const userRoleEnum = pgEnum("user_role", [
  "SUPERADMIN",
  "ADMIN",
  "RECEPCION",
  "DESPACHO",
  "CONTABILIDAD",
]);

export const userStatusEnum = pgEnum("user_status", [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
]);

export const productStatusEnum = pgEnum("product_status", [
  "ACTIVE",
  "INACTIVE",
  "DISCONTINUED",
]);

export const warehouseTypeEnum = pgEnum("warehouse_type", [
  "PROPIA",
  "TERCERO",
  "CAMPAIGN",
  "PROGRAM",
]);

export const warehouseStatusEnum = pgEnum("warehouse_status", [
  "ACTIVE",
  "INACTIVE",
]);

export const movementTypeEnum = pgEnum("movement_type", [
  "ENTRY",
  "EXIT",
  "ADJUSTMENT",
  "AUDIT",
]);

export const entryFormatEnum = pgEnum("entry_format", ["E1", "E3", "N3", "N5"]);

export const entryStatusEnum = pgEnum("entry_status", [
  "DRAFT",
  "CONFIRMED",
  "CANCELLED",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "DRAFT",
  "APPROVED",
  "INVOICED",
  "DISPATCHED",
  "CANCELLED",
]);

export const invoiceFormatEnum = pgEnum("invoice_format", ["SF1", "F2"]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "DRAFT",
  "GENERATED",
  "ASSOCIATED_TO_RECEIPT",
  "CANCELLED",
]);

export const receiptFormatEnum = pgEnum("receipt_format", [
  "R1",
  "R2",
  "R3",
  "R4",
]);

export const receiptStatusEnum = pgEnum("receipt_status", [
  "DRAFT",
  "GENERATED",
  "CANCELLED",
]);

export const dispatchStatusEnum = pgEnum("dispatch_status", [
  "PENDING",
  "PREPARED",
  "DISPATCHED",
  "CANCELLED",
]);

export const auditStatusEnum = pgEnum("audit_status", [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

export const auditLogActionEnum = pgEnum("audit_log_action", [
  "LOGIN",
  "LOGOUT",
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "PRODUCT_DEACTIVATE",
  "ENTRY_CREATE",
  "ENTRY_CONFIRM",
  "EXIT_CREATE",
  "ORDER_CREATE",
  "INVOICE_CREATE",
  "RECEIPT_CREATE",
  "DISPATCH_CREATE",
  "AUDIT_CREATE",
  "EXPORT",
  "IMPORT",
  "SIIGO_OPERATION",
  "USER_CREATE",
  "USER_UPDATE",
  "USER_DEACTIVATE",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "ENTRY",
  "ORDER",
  "INVOICE",
  "RECEIPT",
  "DISPATCH",
]);

// ============================================================
// TABLAS
// ============================================================

// ---------- users ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: varchar("username", { length: 100 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    role: userRoleEnum("role").notNull().default("RECEPCION"),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_users_username").on(table.username),
    index("idx_users_role").on(table.role),
    index("idx_users_status").on(table.status),
  ]
);

// ---------- roles ----------

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: userRoleEnum("name").notNull().unique(),
  description: text("description").notNull(),
  permissions: text("permissions").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- categories ----------

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- products ----------

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    presentation: varchar("presentation", { length: 100 }),
    weight: decimal("weight", { precision: 10, scale: 2 }).notNull().default("0"),
    unit: varchar("unit", { length: 20 }).notNull().default("unidad"),
    categoryId: uuid("category_id").references(() => categories.id),
    status: productStatusEnum("status").notNull().default("ACTIVE"),
    minStock: integer("min_stock").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_products_code").on(table.code),
    index("idx_products_category").on(table.categoryId),
    index("idx_products_status").on(table.status),
  ]
);

// ---------- warehouses ----------

export const warehouses = pgTable(
  "warehouses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 20 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    type: warehouseTypeEnum("type").notNull().default("PROPIA"),
    status: warehouseStatusEnum("status").notNull().default("ACTIVE"),
    observations: text("observations"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_warehouses_code").on(table.code),
    index("idx_warehouses_status").on(table.status),
  ]
);

// ---------- inventory ----------

export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantity: integer("quantity").notNull().default(0),
    lastMovementAt: timestamp("last_movement_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_inventory_product_warehouse").on(
      table.productId,
      table.warehouseId
    ),
    index("idx_inventory_product").on(table.productId),
    index("idx_inventory_warehouse").on(table.warehouseId),
  ]
);

// ---------- inventory_movements ----------

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: movementTypeEnum("type").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantity: integer("quantity").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    documentId: uuid("document_id"),
    documentType: varchar("document_type", { length: 50 }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_movements_product").on(table.productId),
    index("idx_movements_warehouse").on(table.warehouseId),
    index("idx_movements_user").on(table.userId),
    index("idx_movements_created").on(table.createdAt),
    index("idx_movements_type").on(table.type),
  ]
);

// ---------- entries ----------

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    format: entryFormatEnum("format").notNull(),
    number: varchar("number", { length: 50 }).notNull(),
    date: date("date").notNull(),
    nit: varchar("nit", { length: 50 }),
    origin: varchar("origin", { length: 255 }),
    document: varchar("document", { length: 100 }),
    status: entryStatusEnum("status").notNull().default("DRAFT"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_entries_date").on(table.date),
    index("idx_entries_status").on(table.status),
    index("idx_entries_user").on(table.userId),
  ]
);

// ---------- entry_items ----------

export const entryItems = pgTable(
  "entry_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantity: integer("quantity").notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    presentation: varchar("presentation", { length: 100 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_entry_items_entry").on(table.entryId),
    index("idx_entry_items_product").on(table.productId),
  ]
);

// ---------- orders ----------

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: varchar("number", { length: 50 }).notNull(),
    date: date("date").notNull(),
    nit: varchar("nit", { length: 50 }),
    destination: varchar("destination", { length: 255 }),
    status: orderStatusEnum("status").notNull().default("DRAFT"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_orders_date").on(table.date),
    index("idx_orders_status").on(table.status),
    index("idx_orders_user").on(table.userId),
  ]
);

// ---------- order_items ----------

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_order_items_order").on(table.orderId),
    index("idx_order_items_product").on(table.productId),
  ]
);

// ---------- invoices ----------

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    format: invoiceFormatEnum("format").notNull(),
    number: varchar("number", { length: 50 }).notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    date: date("date").notNull(),
    status: invoiceStatusEnum("status").notNull().default("DRAFT"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_invoices_date").on(table.date),
    index("idx_invoices_status").on(table.status),
    index("idx_invoices_order").on(table.orderId),
  ]
);

// ---------- invoice_items ----------

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_invoice_items_invoice").on(table.invoiceId),
    index("idx_invoice_items_product").on(table.productId),
  ]
);

// ---------- receipts ----------

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    format: receiptFormatEnum("format").notNull(),
    number: varchar("number", { length: 50 }).notNull(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    date: date("date").notNull(),
    status: receiptStatusEnum("status").notNull().default("DRAFT"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_receipts_date").on(table.date),
    index("idx_receipts_status").on(table.status),
    index("idx_receipts_invoice").on(table.invoiceId),
  ]
);

// ---------- dispatches ----------

export const dispatches = pgTable(
  "dispatches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: varchar("number", { length: 50 }).notNull(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id),
    date: date("date").notNull(),
    status: dispatchStatusEnum("status").notNull().default("PENDING"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_dispatches_date").on(table.date),
    index("idx_dispatches_status").on(table.status),
    index("idx_dispatches_receipt").on(table.receiptId),
  ]
);

// ---------- dispatch_items ----------

export const dispatchItems = pgTable(
  "dispatch_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dispatchId: uuid("dispatch_id")
      .notNull()
      .references(() => dispatches.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_dispatch_items_dispatch").on(table.dispatchId),
    index("idx_dispatch_items_product").on(table.productId),
  ]
);

// ---------- audits ----------

export const audits = pgTable(
  "audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    date: date("date").notNull(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    responsible: varchar("responsible", { length: 255 }).notNull(),
    status: auditStatusEnum("status").notNull().default("PENDING"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_audits_date").on(table.date),
    index("idx_audits_status").on(table.status),
    index("idx_audits_warehouse").on(table.warehouseId),
  ]
);

// ---------- audit_items ----------

export const auditItems = pgTable(
  "audit_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    systemQuantity: integer("system_quantity").notNull(),
    physicalQuantity: integer("physical_quantity").notNull(),
    difference: integer("difference").notNull(),
    observation: text("observation"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_items_audit").on(table.auditId),
    index("idx_audit_items_product").on(table.productId),
  ]
);

// ---------- audit_logs ----------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    action: auditLogActionEnum("action").notNull(),
    entity: varchar("entity", { length: 100 }).notNull(),
    entityId: uuid("entity_id"),
    result: varchar("result", { length: 20 }).notNull(),
    details: text("details"),
    ipAddress: inet("ip_address"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_logs_user").on(table.userId),
    index("idx_logs_created").on(table.createdAt),
    index("idx_logs_action").on(table.action),
  ]
);

// ---------- documents ----------

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: documentTypeEnum("type").notNull(),
    number: varchar("number", { length: 50 }).notNull(),
    relatedId: uuid("related_id").notNull(),
    generatedBy: uuid("generated_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_documents_type").on(table.type),
    index("idx_documents_related").on(table.relatedId),
  ]
);

// ============================================================
// RELACIONES
// ============================================================

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  inventory: many(inventory),
  entryItems: many(entryItems),
  orderItems: many(orderItems),
  invoiceItems: many(invoiceItems),
  dispatchItems: many(dispatchItems),
  auditItems: many(auditItems),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const warehousesRelations = relations(warehouses, ({ many }) => ({
  inventory: many(inventory),
  entryItems: many(entryItems),
  orderItems: many(orderItems),
  dispatchItems: many(dispatchItems),
  audits: many(audits),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
  product: one(products, {
    fields: [inventory.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [inventory.warehouseId],
    references: [warehouses.id],
  }),
}));

export const entriesRelations = relations(entries, ({ one, many }) => ({
  user: one(users, {
    fields: [entries.userId],
    references: [users.id],
  }),
  items: many(entryItems),
}));

export const entryItemsRelations = relations(entryItems, ({ one }) => ({
  entry: one(entries, {
    fields: [entryItems.entryId],
    references: [entries.id],
  }),
  product: one(products, {
    fields: [entryItems.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [entryItems.warehouseId],
    references: [warehouses.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
  invoices: many(invoices),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [orderItems.warehouseId],
    references: [warehouses.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  order: one(orders, {
    fields: [invoices.orderId],
    references: [orders.id],
  }),
  user: one(users, {
    fields: [invoices.userId],
    references: [users.id],
  }),
  items: many(invoiceItems),
  receipts: many(receipts),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
  product: one(products, {
    fields: [invoiceItems.productId],
    references: [products.id],
  }),
}));

export const receiptsRelations = relations(receipts, ({ one, many }) => ({
  invoice: one(invoices, {
    fields: [receipts.invoiceId],
    references: [invoices.id],
  }),
  user: one(users, {
    fields: [receipts.userId],
    references: [users.id],
  }),
  dispatches: many(dispatches),
}));

export const dispatchesRelations = relations(dispatches, ({ one, many }) => ({
  receipt: one(receipts, {
    fields: [dispatches.receiptId],
    references: [receipts.id],
  }),
  user: one(users, {
    fields: [dispatches.userId],
    references: [users.id],
  }),
  items: many(dispatchItems),
}));

export const dispatchItemsRelations = relations(dispatchItems, ({ one }) => ({
  dispatch: one(dispatches, {
    fields: [dispatchItems.dispatchId],
    references: [dispatches.id],
  }),
  product: one(products, {
    fields: [dispatchItems.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [dispatchItems.warehouseId],
    references: [warehouses.id],
  }),
}));

export const auditsRelations = relations(audits, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [audits.warehouseId],
    references: [warehouses.id],
  }),
  user: one(users, {
    fields: [audits.userId],
    references: [users.id],
  }),
  items: many(auditItems),
}));

export const auditItemsRelations = relations(auditItems, ({ one }) => ({
  audit: one(audits, {
    fields: [auditItems.auditId],
    references: [audits.id],
  }),
  product: one(products, {
    fields: [auditItems.productId],
    references: [products.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  entries: many(entries),
  orders: many(orders),
  invoices: many(invoices),
  receipts: many(receipts),
  dispatches: many(dispatches),
  audits: many(audits),
  auditLogs: many(auditLogs),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));
