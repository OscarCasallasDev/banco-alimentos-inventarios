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
  bigserial,
  decimal,
  numeric,
  date,
  timestamp,
  inet,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ============================================================
// ENUMS
// ============================================================

export const userRoleEnum = pgEnum("user_role", [
  "SUPERADMIN",
  "ADMIN",
  "ALMACENISTA",
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

export const lotStatusEnum = pgEnum("lot_status", [
  "DRAFT",
  "ACTIVE",
  "BLOCKED",
  "DEPLETED",
  "DISPOSED",
  "CANCELLED",
]);

export const lotOriginEnum = pgEnum("lot_origin", [
  "ENTRY",
  "OPENING",
  "ADJUSTMENT",
  "RETURN",
  "TRANSFER",
  "MIGRATION",
]);

export const lotTraceabilityEnum = pgEnum("lot_traceability", [
  "FULL",
  "PARTIAL",
  "NONE",
]);

export const stockUnitKindEnum = pgEnum("stock_unit_kind", [
  "COUNT",
  "MASS",
  "VOLUME",
  "UNKNOWN",
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
  "WAREHOUSE_CREATE",
  "WAREHOUSE_UPDATE",
  "WAREHOUSE_DEACTIVATE",
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
  "LOT_CREATE",
  "LOT_UPDATE",
  "LOT_BLOCK",
  "LOT_DISPOSE",
  "LOT_EXPIRATION_CHANGE",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "ENTRY",
  "ORDER",
  "INVOICE",
  "RECEIPT",
  "DISPATCH",
  "EXIT",
]);

export const programStatusEnum = pgEnum("program_status", ["ACTIVE", "INACTIVE"]);

export const siigoImportStatusEnum = pgEnum("siigo_import_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "REJECTED",
]);

export const salidaStatusEnum = pgEnum("salida_status", [
  "DRAFT",
  "GENERATED",
  "DELIVERED",
  "CONFIRMED_SIIGO",
  "CANCELLED",
]);

export const reservationStateEnum = pgEnum("reservation_state", [
  "PENDING",
  "RELEASED",
  "CANCELLED",
]);

export const diffStatusEnum = pgEnum("diff_status", [
  "MATCHED",
  "PARTIAL",
  "UNMATCHED",
  "NO_CHANGE",
  "REVIEW",
]);

export const thirdPartyTypeEnum = pgEnum("third_party_type", [
  "CLIENTE",
  "PROVEEDOR",
  "DONANTE",
  "PARROQUIA",
  "OTROS",
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
    email: varchar("email", { length: 255 }).notNull(),
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
    uniqueIndex("idx_users_email").on(table.email),
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
    weight: decimal("weight", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    unit: varchar("unit", { length: 20 }).notNull().default("unidad"),
    /** Unidad física en la que se cuenta el stock (UND, PAQUETE, LB, KG…). */
    stockUnit: varchar("stock_unit", { length: 20 }).notNull().default("UND"),
    /** Naturaleza de la unidad de stock, para no mezclar conteo con masa/volumen. */
    unitKind: stockUnitKindEnum("unit_kind").notNull().default("UNKNOWN"),
    /** Contenido neto de una unidad de stock. 0/null = no informado. */
    netWeightGrams: numeric("net_weight_grams", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    netVolumeMl: numeric("net_volume_ml", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    /** El contenido es una estimación, no un dato verificado del empaque. */
    weightIsEstimate: boolean("weight_is_estimate").notNull().default(false),
    /** El producto requiere control de vencimiento por lote. */
    tracksExpiration: boolean("tracks_expiration").notNull().default(true),
    categoryId: uuid("category_id").references(() => categories.id),
    status: productStatusEnum("status").notNull().default("ACTIVE"),
    minStock: numeric("min_stock", { precision: 14, scale: 3, mode: "number" })
      .notNull()
      .default(0),
    /** Origen del producto: MANUAL (catálogo local) o SIIGO (importado). */
    source: varchar("source", { length: 20 }).notNull().default("MANUAL"),
    /** REFERENCIA del reporte de Siigo (clasificación con variantes ortográficas). */
    siigoReference: text("siigo_reference"),
    /** MARCA del reporte de Siigo. */
    siigoBrand: text("siigo_brand"),
    siigoLin: integer("siigo_lin"),
    siigoGrup: integer("siigo_grup"),
    siigoElemet: integer("siigo_elemet"),
    /** Procedencia del peso: MANUAL | DERIVADO_NOMBRE. */
    weightSource: varchar("weight_source", { length: 20 }),
    /** Bodega Siigo de la que proviene el producto. */
    siigoBodegaCode: integer("siigo_bodega_code"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_products_code").on(table.code),
    index("idx_products_category").on(table.categoryId),
    index("idx_products_status").on(table.status),
    index("idx_products_source").on(table.source),
    index("idx_products_siigo_ref").on(table.siigoReference),
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
    /** Origen: MANUAL (catálogo local) o SIIGO (importado del reporte). */
    source: varchar("source", { length: 20 }).notNull().default("MANUAL"),
    /** Código de bodega en Siigo Pyme. */
    siigoCode: integer("siigo_code"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_warehouses_code").on(table.code),
    index("idx_warehouses_status").on(table.status),
    index("idx_warehouses_siigo_code").on(table.siigoCode),
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
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull().default(0),
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
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 14, scale: 3, mode: "number" }).notNull(),
    /** Lote afectado. Null solo en movimientos históricos anteriores al modelo. */
    lotId: uuid("lot_id").references((): AnyPgColumn => lots.id),
    /** Saldo del lote después del movimiento. */
    lotBalanceAfter: numeric("lot_balance_after", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
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
    index("idx_movements_lot").on(table.lotId),
  ]
);

// ---------- entries ----------

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    format: entryFormatEnum("format").notNull(),
    number: varchar("number", { length: 50 }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    nit: varchar("nit", { length: 50 }),
    origin: varchar("origin", { length: 255 }),
    document: varchar("document", { length: 100 }),
    status: entryStatusEnum("status").notNull().default("DRAFT"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    /** Momento en que el stock se aplicó; garantiza idempotencia. */
    stockAppliedAt: timestamp("stock_applied_at"),
    /** Entidad que entrega los productos (proveedor, donante, cliente…). */
    thirdPartyId: uuid("third_party_id").references(() => thirdParties.id),
    /** Centro de costo del documento. */
    costCenterId: uuid("cost_center_id").references(() => costCenters.id),
    /** Orden de compra asociada (vacía si no aplica). */
    purchaseOrder: varchar("purchase_order", { length: 50 }),
    /** Número de vendedor del documento. */
    sellerNumber: integer("seller_number").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_entries_number_unique").on(table.number),
    index("idx_entries_date").on(table.date),
    index("idx_entries_status").on(table.status),
    index("idx_entries_user").on(table.userId),
    index("idx_entries_third_party").on(table.thirdPartyId),
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
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    presentation: varchar("presentation", { length: 100 }),
    /** Número de línea del producto dentro de la entrada. */
    sequence: integer("sequence").notNull().default(1),
    /** Descripción del producto tal como se imprimió (CD, nombre, presentación). */
    description: text("description"),
    /** NIT de la entidad que entrega el producto en el momento del registro. */
    nit: varchar("nit", { length: 50 }),
    /** Centro de costo de la línea. */
    costCenterId: uuid("cost_center_id").references(() => costCenters.id),
    /** Ubicación dentro de la bodega. */
    location: varchar("location", { length: 50 }),
    /** Valor monetario de la línea. */
    value: numeric("value", { precision: 14, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    /** Indicador débito/crédito del movimiento. */
    debitCredit: numeric("debit_credit", { precision: 14, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_entry_items_entry").on(table.entryId),
    index("idx_entry_items_product").on(table.productId),
    index("idx_entry_items_sequence").on(table.entryId, table.sequence),
  ]
);

// ---------- lots (lotes: unidad de trazabilidad del stock) ----------

export const lots = pgTable(
  "lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Código interno generado por el sistema. Único e inmutable. */
    code: varchar("code", { length: 50 }).notNull(),
    /** Código del proveedor/fabricante. No es único. */
    externalCode: varchar("external_code", { length: 100 }),
    entryId: uuid("entry_id").references(() => entries.id),
    entryItemId: uuid("entry_item_id").references(() => entryItems.id, {
      onDelete: "restrict",
    }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    status: lotStatusEnum("status").notNull().default("DRAFT"),
    origin: lotOriginEnum("origin").notNull().default("ENTRY"),
    traceability: lotTraceabilityEnum("traceability").notNull().default("PARTIAL"),
    /** Denominación del lote (por ejemplo "Lotes Inicial"). */
    description: varchar("description", { length: 100 }),
    notes: text("notes"),
    expirationDate: date("expiration_date", { mode: "string" }),
    receivedAt: timestamp("received_at"),
    quantityReceived: numeric("quantity_received", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .notNull()
      .default(0),
    quantityAvailable: numeric("quantity_available", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .notNull()
      .default(0),
    /** Unidad de manejo del lote. La cantidad NO se convierte a kg/L. */
    stockUnit: varchar("stock_unit", { length: 20 }).notNull().default("UND"),
    /** Naturaleza de la unidad, congelada al crear el lote (COUNT/MASS/VOLUME). */
    unitKind: stockUnitKindEnum("unit_kind").notNull().default("UNKNOWN"),
    /** Presentación comercial del lote, congelada al crearlo. */
    presentation: varchar("presentation", { length: 100 }),
    /** Contenido neto por unidad de manejo, congelado al crear el lote. */
    netWeightGrams: numeric("net_weight_grams", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    netVolumeMl: numeric("net_volume_ml", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    weightIsEstimate: boolean("weight_is_estimate").notNull().default(false),
    /** Saldo de apertura o lote sin soporte documental completo. */
    isHistorical: boolean("is_historical").notNull().default(false),
    parentLotId: uuid("parent_lot_id").references((): AnyPgColumn => lots.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_lots_code_unique").on(table.code),
    index("idx_lots_entry_item").on(table.entryItemId),
    index("idx_lots_entry").on(table.entryId),
    index("idx_lots_product").on(table.productId),
    index("idx_lots_warehouse").on(table.warehouseId),
    index("idx_lots_expiration").on(table.expirationDate),
    index("idx_lots_status_available").on(table.status, table.quantityAvailable),
    index("idx_lots_fefo").on(
      table.productId,
      table.warehouseId,
      table.expirationDate,
      table.receivedAt
    ),
    index("idx_lots_created").on(table.createdAt),
  ]
);

/**
 * Alias de compatibilidad con el nombre anterior de la tabla.
 * @deprecated Usar `lots`.
 */
export const entryItemLots = lots;

// ---------- lot_sequences (consecutivo atómico por producto/día) ----------

export const lotSequences = pgTable("lot_sequences", {
  scope: varchar("scope", { length: 80 }).primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------- system_settings (parámetros operativos del Banco) ----------

/**
 * Parámetros que el Banco puede ajustar sin desplegar código.
 * Se leen con caché corta porque cambian muy rara vez.
 */
export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});



// ---------- third_parties (entidades que entregan productos) ----------

export const thirdParties = pgTable(
  "third_parties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** NIT o cédula de la entidad. */
    nit: varchar("nit", { length: 50 }).notNull(),
    /** Sucursal (casi siempre "001"). */
    branch: varchar("branch", { length: 10 }).notNull().default(""),
    /** Razón social o nombre. */
    name: varchar("name", { length: 255 }).notNull(),
    type: thirdPartyTypeEnum("type").notNull().default("CLIENTE"),
    address: text("address"),
    phone: varchar("phone", { length: 50 }),
    city: varchar("city", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_third_parties_nit_branch").on(table.nit, table.branch),
    index("idx_third_parties_name").on(table.name),
    index("idx_third_parties_type").on(table.type),
  ]
);

// ---------- cost_centers ----------

export const costCenters = pgTable(
  "cost_centers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_cost_centers_code").on(table.code)]
);

// ---------- units (catálogo de unidades de medida) ----------

export const units = pgTable(
  "units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_units_code").on(table.code)]
);

// ---------- document_sequences (consecutivo atómico por tipo) ----------

export const documentSequences = pgTable("document_sequences", {
  type: varchar("type", { length: 20 }).primaryKey(),
  /** Último consecutivo asignado para este tipo de documento. */
  lastNumber: integer("last_number").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------- orders ----------

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: varchar("number", { length: 50 }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
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
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
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
    date: date("date", { mode: "string" }).notNull(),
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
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
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
    date: date("date", { mode: "string" }).notNull(),
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
    date: date("date", { mode: "string" }).notNull(),
    status: dispatchStatusEnum("status").notNull().default("PENDING"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    /** Momento en que el stock se aplicó; garantiza idempotencia. */
    stockAppliedAt: timestamp("stock_applied_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_dispatches_receipt_unique").on(table.receiptId),
    index("idx_dispatches_date").on(table.date),
    index("idx_dispatches_status").on(table.status),
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
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_dispatch_items_dispatch").on(table.dispatchId),
    index("idx_dispatch_items_product").on(table.productId),
  ]
);

// ---------- dispatch_item_lots (asignación de lotes a una salida) ----------

export const dispatchItemLots = pgTable(
  "dispatch_item_lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dispatchItemId: uuid("dispatch_item_id")
      .notNull()
      .references(() => dispatchItems.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    /** Snapshot del contenido neto del lote al momento de la salida. */
    netWeightGrams: numeric("net_weight_grams", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    netVolumeMl: numeric("net_volume_ml", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_dispatch_item_lots_unique").on(table.dispatchItemId, table.lotId),
    index("idx_dispatch_item_lots_lot").on(table.lotId),
  ]
);

// ---------- audits ----------

export const audits = pgTable(
  "audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    responsible: varchar("responsible", { length: 255 }).notNull(),
    status: auditStatusEnum("status").notNull().default("PENDING"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    /** Momento en que el ajuste se aplicó; garantiza idempotencia. */
    stockAppliedAt: timestamp("stock_applied_at"),
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
    systemQuantity: numeric("system_quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    physicalQuantity: numeric("physical_quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    difference: numeric("difference", { precision: 14, scale: 3, mode: "number" }).notNull(),
    observation: text("observation"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_items_audit").on(table.auditId),
    index("idx_audit_items_product").on(table.productId),
  ]
);

// ---------- audit_item_lots (conteo/ajuste por lote) ----------

export const auditItemLots = pgTable(
  "audit_item_lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditItemId: uuid("audit_item_id")
      .notNull()
      .references(() => auditItems.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    systemQuantity: numeric("system_quantity", {
      precision: 14,
      scale: 3,
      mode: "number",
    }).notNull(),
    physicalQuantity: numeric("physical_quantity", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    difference: numeric("difference", { precision: 14, scale: 3, mode: "number" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_audit_item_lots_audit_item").on(table.auditItemId),
    index("idx_audit_item_lots_lot").on(table.lotId),
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
// MÓDULO DE IMPORTACIÓN SIIGO PYME + SALIDAS DE ALMACÉN
// ============================================================

// ---------- feature_flags ----------

export const featureFlags = pgTable("feature_flags", {
  key: varchar("key", { length: 80 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

// ---------- destinations (parroquias / grupos de familia) ----------

export const destinations = pgTable(
  "destinations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 30 }),
    name: varchar("name", { length: 150 }).notNull(),
    type: varchar("type", { length: 30 }).notNull().default("OTRO"),
    /** true si es un dato de demostración (el Banco lo puede reemplazar). */
    isDemo: boolean("is_demo").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_destinations_name").on(sql`lower(${table.name})`),
    index("idx_destinations_status").on(table.status, table.sortOrder),
  ]
);

// ---------- programs (programas / destinos) ----------

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 30 }).notNull().unique(),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
    requiresReceiver: boolean("requires_receiver").notNull().default(true),
    status: programStatusEnum("status").notNull().default("ACTIVE"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_programs_status").on(table.status, table.sortOrder)]
);

// ---------- siigo_warehouse_map ----------

export const siigoWarehouseMap = pgTable("siigo_warehouse_map", {
  siigoBodegaCode: integer("siigo_bodega_code").primaryKey(),
  warehouseId: uuid("warehouse_id").references(() => warehouses.id, {
    onDelete: "set null",
  }),
  label: varchar("label", { length: 100 }),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

// ---------- siigo_import_runs ----------

export const siigoImportRuns = pgTable(
  "siigo_import_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fileSha256: text("file_sha256").notNull(),
    fileName: text("file_name"),
    fileSize: integer("file_size"),
    source: varchar("source", { length: 20 }).notNull().default("MANUAL"),
    agentId: text("agent_id"),
    reportDate: date("report_date"),
    periodFrom: date("period_from"),
    periodTo: date("period_to"),
    generatedAt: timestamp("generated_at"),
    status: siigoImportStatusEnum("status").notNull().default("PENDING"),
    stage: varchar("stage", { length: 30 }),
    totalRows: integer("total_rows").notNull().default(0),
    dataRows: integer("data_rows").notNull().default(0),
    processedRows: integer("processed_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    rejectedRows: integer("rejected_rows").notNull().default(0),
    productsCount: integer("products_count").notNull().default(0),
    balancesCount: integer("balances_count").notNull().default(0),
    movementsCount: integer("movements_count").notNull().default(0),
    groupsReview: integer("groups_review").notNull().default(0),
    diffsFound: integer("diffs_found").notNull().default(0),
    durationMs: integer("duration_ms"),
    errorSummary: jsonb("error_summary"),
    /** Tipo de reporte: DETAILED (detallado) o RESUMEN (resumen por bodega). */
    reportFormat: varchar("report_format", { length: 30 }),
    periodNature: varchar("period_nature", { length: 40 }),
    vencimientoRecords: integer("vencimiento_records").notNull().default(0),
    /** Filas normalizadas del reporte resumido (son pocas). */
    payload: jsonb("payload"),
    warehousesCount: integer("warehouses_count").notNull().default(0),
    locationsCount: integer("locations_count").notNull().default(0),
    newRecords: integer("new_records").notNull().default(0),
    updatedRecords: integer("updated_records").notNull().default(0),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_siigo_runs_created").on(table.createdAt),
    index("idx_siigo_runs_status").on(table.status),
    index("idx_siigo_runs_hash").on(table.fileSha256),
  ]
);

// ---------- siigo_import_batches ----------

export const siigoImportBatches = pgTable(
  "siigo_import_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => siigoImportRuns.id, { onDelete: "cascade" }),
    batchIndex: integer("batch_index").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    payloadHash: text("payload_hash"),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("siigo_import_batches_unique").on(table.runId, table.batchIndex),
  ]
);

// ---------- siigo_import_rows (staging) ----------

export const siigoImportRows = pgTable(
  "siigo_import_rows",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => siigoImportRuns.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    productCode: text("product_code").notNull(),
    lin: integer("lin"),
    grup: integer("grup"),
    elemet: integer("elemet"),
    productName: text("product_name"),
    referenceText: text("reference_text"),
    brandText: text("brand_text"),
    unitCode: text("unit_code"),
    descriptionText: text("description_text"),
    documentRaw: text("document_raw"),
    docType: varchar("doc_type", { length: 10 }),
    docNumber: text("doc_number"),
    docSequence: text("doc_sequence"),
    movementDate: date("movement_date"),
    isOpening: boolean("is_opening").notNull().default(false),
    siigoBodegaCode: integer("siigo_bodega_code").notNull(),
    locationCode: integer("location_code").notNull(),
    qtyBefore: numeric("qty_before", { precision: 14, scale: 3, mode: "number" }),
    qtyIn: numeric("qty_in", { precision: 14, scale: 3, mode: "number" }),
    qtyOut: numeric("qty_out", { precision: 14, scale: 3, mode: "number" }),
    qtyNet: numeric("qty_net", { precision: 14, scale: 3, mode: "number" }),
    qtyAccum: numeric("qty_accum", { precision: 14, scale: 3, mode: "number" }),
    valueMovement: numeric("value_movement", { precision: 14, scale: 2, mode: "number" }),
    qty2In: numeric("qty2_in", { precision: 14, scale: 3, mode: "number" }),
    qty2Out: numeric("qty2_out", { precision: 14, scale: 3, mode: "number" }),
    qty2Balance: numeric("qty2_balance", { precision: 14, scale: 3, mode: "number" }),
    rowHash: text("row_hash"),
  },
  (table) => [
    uniqueIndex("siigo_import_rows_unique").on(table.runId, table.rowNumber),
    index("idx_siigo_rows_group").on(
      table.runId,
      table.productCode,
      table.siigoBodegaCode,
      table.locationCode
    ),
    index("idx_siigo_rows_date").on(table.runId, table.movementDate),
  ]
);

// ---------- siigo_import_rejections ----------

export const siigoImportRejections = pgTable(
  "siigo_import_rejections",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => siigoImportRuns.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    reasonCode: varchar("reason_code", { length: 40 }).notNull(),
    reason: text("reason").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_siigo_rej_run").on(table.runId)]
);

// ---------- siigo_movements ----------

export const siigoMovements = pgTable(
  "siigo_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: uuid("warehouse_id").references(() => warehouses.id, {
      onDelete: "set null",
    }),
    siigoBodegaCode: integer("siigo_bodega_code").notNull(),
    locationCode: integer("location_code").notNull(),
    movementDate: date("movement_date").notNull(),
    isOpening: boolean("is_opening").notNull().default(false),
    documentRaw: text("document_raw").notNull(),
    docType: varchar("doc_type", { length: 10 }),
    docNumber: text("doc_number"),
    docSequence: text("doc_sequence"),
    descriptionText: text("description_text"),
    qtyIn: numeric("qty_in", { precision: 14, scale: 3, mode: "number" })
      .notNull()
      .default(0),
    qtyOut: numeric("qty_out", { precision: 14, scale: 3, mode: "number" })
      .notNull()
      .default(0),
    qtyNet: numeric("qty_net", { precision: 14, scale: 3, mode: "number" })
      .notNull()
      .default(0),
    balanceAfter: numeric("balance_after", { precision: 14, scale: 3, mode: "number" }),
    valueMovement: numeric("value_movement", { precision: 14, scale: 2, mode: "number" }),
    contentHash: text("content_hash"),
    importRunId: uuid("import_run_id").references(() => siigoImportRuns.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("siigo_movements_unique").on(
      table.productId,
      table.siigoBodegaCode,
      table.locationCode,
      table.movementDate,
      table.documentRaw
    ),
    index("idx_siigo_mov_prod_date").on(table.productId, table.movementDate),
    index("idx_siigo_mov_doc").on(table.docNumber),
    index("idx_siigo_mov_run").on(table.importRunId),
    index("idx_siigo_mov_bodega").on(table.siigoBodegaCode, table.movementDate),
  ]
);

// ---------- siigo_balances (FUENTE DE EXISTENCIAS) ----------

export const siigoBalances = pgTable(
  "siigo_balances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: uuid("warehouse_id").references(() => warehouses.id, {
      onDelete: "set null",
    }),
    siigoBodegaCode: integer("siigo_bodega_code").notNull(),
    locationCode: integer("location_code").notNull(),
    /** Saldo recalculado: CANT. ANTERIOR + Σ(ENTRADAS - SALIDAS). */
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" })
      .notNull()
      .default(0),
    /** Último ACUM CANTIDAD reportado por Siigo (solo contraste). */
    reportedQuantity: numeric("reported_quantity", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    qtySecondary: numeric("qty_secondary", { precision: 14, scale: 3, mode: "number" }),
    openingQuantity: numeric("opening_quantity", { precision: 14, scale: 3, mode: "number" }),
    reviewRequired: boolean("review_required").notNull().default(false),
    reviewNote: text("review_note"),
    isNegative: boolean("is_negative").notNull().default(false),
    importRunId: uuid("import_run_id")
      .notNull()
      .references(() => siigoImportRuns.id),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("siigo_balances_unique").on(
      table.productId,
      table.siigoBodegaCode,
      table.locationCode
    ),
    index("idx_siigo_bal_prod").on(table.productId),
    index("idx_siigo_bal_wh").on(table.warehouseId),
    index("idx_siigo_bal_bod").on(table.siigoBodegaCode),
    index("idx_siigo_bal_run").on(table.importRunId),
    index("idx_siigo_bal_active").on(table.isActive, table.productId),
  ]
);

// ---------- siigo_balance_diffs ----------

export const siigoBalanceDiffs = pgTable(
  "siigo_balance_diffs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importRunId: uuid("import_run_id")
      .notNull()
      .references(() => siigoImportRuns.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    siigoBodegaCode: integer("siigo_bodega_code").notNull(),
    previousQuantity: numeric("previous_quantity", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .notNull()
      .default(0),
    newQuantity: numeric("new_quantity", { precision: 14, scale: 3, mode: "number" })
      .notNull()
      .default(0),
    delta: numeric("delta", { precision: 14, scale: 3, mode: "number" }).notNull().default(0),
    reservedQuantity: numeric("reserved_quantity", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .notNull()
      .default(0),
    matchedSalidaId: uuid("matched_salida_id").references(() => salidas.id),
    status: diffStatusEnum("status").notNull().default("NO_CHANGE"),
    note: text("note"),
    /** Clave del grupo consolidado (descripci?n|unidad|bodega). */
    groupKey: text("group_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_siigo_diffs_run").on(table.importRunId, table.status),
    index("idx_siigo_diffs_prod").on(table.productId),
  ]
);

// ---------- siigo_locations ----------

export const siigoLocations = pgTable(
  "siigo_locations",
  {
    siigoBodegaCode: integer("siigo_bodega_code").notNull(),
    locationCode: integer("location_code").notNull(),
    name: varchar("name", { length: 150 }).notNull(),
    importRunId: uuid("import_run_id").references(() => siigoImportRuns.id),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("siigo_locations_unique").on(
      table.siigoBodegaCode,
      table.locationCode
    ),
  ]
);

// ---------- siigo_resumen_movements (movimientos agregados del resumen) ----------

export const siigoResumenMovements = pgTable(
  "siigo_resumen_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    siigoBodegaCode: integer("siigo_bodega_code").notNull(),
    locationCode: integer("location_code").notNull(),
    qtyIn: numeric("qty_in", { precision: 14, scale: 3, mode: "number" })
      .notNull()
      .default(0),
    qty2In: numeric("qty2_in", { precision: 14, scale: 3, mode: "number" })
      .notNull()
      .default(0),
    valueIn: numeric("value_in", { precision: 14, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    qtyOut: numeric("qty_out", { precision: 14, scale: 3, mode: "number" })
      .notNull()
      .default(0),
    qty2Out: numeric("qty2_out", { precision: 14, scale: 3, mode: "number" })
      .notNull()
      .default(0),
    valueOut: numeric("value_out", { precision: 14, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    netQuantity: numeric("net_quantity", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .notNull()
      .default(0),
    /** MOVIMIENTO_NETO_PERIODO: no es un saldo disponible. */
    quantityNature: varchar("quantity_nature", { length: 40 }),
    periodFrom: date("period_from"),
    periodTo: date("period_to"),
    importRunId: uuid("import_run_id")
      .notNull()
      .references(() => siigoImportRuns.id),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("siigo_resumen_unique").on(
      table.productId,
      table.siigoBodegaCode,
      table.locationCode
    ),
    index("idx_siigo_resumen_prod").on(table.productId),
    index("idx_siigo_resumen_bod").on(table.siigoBodegaCode),
    index("idx_siigo_resumen_run").on(table.importRunId),
  ]
);

// ---------- salidas (operativas, no contables) ----------

export const salidas = pgTable(
  "salidas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: varchar("number", { length: 50 }).notNull().unique(),
    date: text("date").notNull(),
    time: text("time").notNull(),
    /** Programa del catálogo. Nulo cuando se usa un programa propio. */
    programId: uuid("program_id").references(() => programs.id),
    /** Nombre del programa escrito por el usuario (opción «Otro programa»). */
    customProgramName: text("custom_program_name"),
    /** Destino (parroquia / grupo de familia) del catálogo configurable. */
    destinationId: uuid("destination_id").references(() => destinations.id, {
      onDelete: "set null",
    }),
    warehouseId: uuid("warehouse_id").references(() => warehouses.id, {
      onDelete: "set null",
    }),
    siigoBodegaCode: integer("siigo_bodega_code"),
    locationCode: integer("location_code"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** Almacenista que ENTREGA (registrado al crear la orden). */
    delivererName: text("deliverer_name"),
    delivererDocument: text("deliverer_document"),
    /** Quien RECIBE en despacho (se registra al confirmar la recepci?n). */
    receiverName: text("receiver_name"),
    receiverDocument: text("receiver_document"),
    receiverTime: text("receiver_time"),
    receiverSignedAt: timestamp("receiver_signed_at"),
    status: salidaStatusEnum("status").notNull().default("DRAFT"),
    notes: text("notes"),
    totalQuantity: numeric("total_quantity", { precision: 14, scale: 3, mode: "number" })
      .notNull()
      .default(0),
    totalWeightKg: numeric("total_weight_kg", { precision: 14, scale: 3, mode: "number" }),
    weightPartial: boolean("weight_partial").notNull().default(false),
    itemCount: integer("item_count").notNull().default(0),
    documentGeneratedAt: timestamp("document_generated_at"),
    deliveredAt: timestamp("delivered_at"),
    confirmedAt: timestamp("confirmed_at"),
    cancelledAt: timestamp("cancelled_at"),
    /** Borrado l?gico: la orden se oculta pero no se destruye el historial. */
    deletedAt: timestamp("deleted_at"),
    deletedBy: uuid("deleted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    siigoDocumentRef: text("siigo_document_ref"),
    reconciliationStatus: varchar("reconciliation_status", { length: 20 })
      .notNull()
      .default("PENDING"),
    reconciliationNote: text("reconciliation_note"),
    reconciledRunId: uuid("reconciled_run_id").references(() => siigoImportRuns.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_salidas_status").on(table.status, table.date),
    index("idx_salidas_user").on(table.userId, table.date),
    index("idx_salidas_program").on(table.programId, table.date),
    index("idx_salidas_recon").on(table.reconciliationStatus),
  ]
);

// ---------- salida_items ----------

export const salidaItems = pgTable(
  "salida_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    salidaId: uuid("salida_id")
      .notNull()
      .references(() => salidas.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: uuid("warehouse_id").references(() => warehouses.id, {
      onDelete: "set null",
    }),
    siigoBodegaCode: integer("siigo_bodega_code").notNull(),
    locationCode: integer("location_code").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    unitCode: text("unit_code"),
    presentation: text("presentation"),
    /** Snapshot del nombre para reimprimir sin depender del catálogo actual. */
    productName: text("product_name"),
    productReference: text("product_reference"),
    /** Descripci?n consolidada con la que se registr? la l?nea. */
    consolidatedDescription: text("consolidated_description"),
    /** C?digos de Siigo del grupo consolidado (foto hist?rica). */
    consolidatedCodes: text("consolidated_codes").array(),
    unitWeightKg: numeric("unit_weight_kg", { precision: 14, scale: 3, mode: "number" }),
    totalWeightKg: numeric("total_weight_kg", { precision: 14, scale: 3, mode: "number" }),
    weightKnown: boolean("weight_known").notNull().default(false),
    /** Peso registrado por el almacenista en la orden. */
    weight: numeric("weight", { precision: 14, scale: 3, mode: "number" }),
    /** Unidad del peso registrado (kg, g, ml, l). */
    weightUnit: varchar("weight_unit", { length: 20 }),
    /** Fecha de vencimiento del producto en esta línea. */
    expirationDate: text("expiration_date"),
    availableAtCreation: numeric("available_at_creation", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .notNull()
      .default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("salida_items_unique").on(
      table.salidaId,
      table.productId,
      table.siigoBodegaCode,
      table.locationCode
    ),
    index("idx_salida_items_salida").on(table.salidaId, table.lineNo),
    index("idx_salida_items_prod").on(table.productId),
  ]
);

// ---------- siigo_reservations (cantidades comprometidas) ----------

export const siigoReservations = pgTable(
  "siigo_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    salidaId: uuid("salida_id")
      .notNull()
      .references(() => salidas.id, { onDelete: "cascade" }),
    salidaItemId: uuid("salida_item_id")
      .notNull()
      .references(() => salidaItems.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    siigoBodegaCode: integer("siigo_bodega_code").notNull(),
    locationCode: integer("location_code").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
    reservedQuantity: numeric("reserved_quantity", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .notNull()
      .default(0),
    releasedQuantity: numeric("released_quantity", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .notNull()
      .default(0),
    state: reservationStateEnum("state").notNull().default("PENDING"),
    releasedAt: timestamp("released_at"),
    releasedRunId: uuid("released_run_id").references(() => siigoImportRuns.id),
    /** Clave del grupo consolidado (descripci?n|unidad|bodega). */
    groupKey: text("group_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("siigo_reservations_unique").on(table.salidaItemId),
    index("idx_siigo_res_state").on(table.state, table.productId, table.siigoBodegaCode),
    index("idx_siigo_res_salida").on(table.salidaId),
    index("idx_siigo_res_prod").on(table.productId, table.siigoBodegaCode, table.state),
  ]
);

// ---------- api_keys (agente local de sincronización) ----------

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    keyHash: text("key_hash").notNull().unique(),
    label: varchar("label", { length: 80 }).notNull(),
    scope: varchar("scope", { length: 40 }).notNull().default("SIIGO_IMPORT"),
    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_api_keys_scope").on(table.scope, table.isActive)]
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
  lots: many(lots),
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
  lots: many(lots),
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
  lots: many(lots),
}));

export const entryItemsRelations = relations(entryItems, ({ one, many }) => ({
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
  lots: many(lots),
}));

export const lotsRelations = relations(lots, ({ one, many }) => ({
  entry: one(entries, {
    fields: [lots.entryId],
    references: [entries.id],
  }),
  entryItem: one(entryItems, {
    fields: [lots.entryItemId],
    references: [entryItems.id],
  }),
  product: one(products, {
    fields: [lots.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [lots.warehouseId],
    references: [warehouses.id],
  }),
  createdBy: one(users, {
    fields: [lots.createdBy],
    references: [users.id],
  }),
  dispatchAllocations: many(dispatchItemLots),
  auditAllocations: many(auditItemLots),
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

export const dispatchItemsRelations = relations(dispatchItems, ({ one, many }) => ({
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
  lotAllocations: many(dispatchItemLots),
}));

export const dispatchItemLotsRelations = relations(dispatchItemLots, ({ one }) => ({
  dispatchItem: one(dispatchItems, {
    fields: [dispatchItemLots.dispatchItemId],
    references: [dispatchItems.id],
  }),
  lot: one(lots, {
    fields: [dispatchItemLots.lotId],
    references: [lots.id],
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

export const auditItemsRelations = relations(auditItems, ({ one, many }) => ({
  audit: one(audits, {
    fields: [auditItems.auditId],
    references: [audits.id],
  }),
  product: one(products, {
    fields: [auditItems.productId],
    references: [products.id],
  }),
  lotAllocations: many(auditItemLots),
}));

export const auditItemLotsRelations = relations(auditItemLots, ({ one }) => ({
  auditItem: one(auditItems, {
    fields: [auditItemLots.auditItemId],
    references: [auditItems.id],
  }),
  lot: one(lots, {
    fields: [auditItemLots.lotId],
    references: [lots.id],
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
  createdLots: many(lots),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// ---------- Relaciones del módulo Siigo + Salidas ----------

export const programsRelations = relations(programs, ({ many }) => ({
  salidas: many(salidas),
}));

export const siigoWarehouseMapRelations = relations(siigoWarehouseMap, ({ one }) => ({
  warehouse: one(warehouses, {
    fields: [siigoWarehouseMap.warehouseId],
    references: [warehouses.id],
  }),
}));

export const siigoImportRunsRelations = relations(siigoImportRuns, ({ many }) => ({
  batches: many(siigoImportBatches),
  rows: many(siigoImportRows),
  rejections: many(siigoImportRejections),
  balances: many(siigoBalances),
  diffs: many(siigoBalanceDiffs),
}));

export const siigoBalancesRelations = relations(siigoBalances, ({ one }) => ({
  product: one(products, {
    fields: [siigoBalances.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [siigoBalances.warehouseId],
    references: [warehouses.id],
  }),
  importRun: one(siigoImportRuns, {
    fields: [siigoBalances.importRunId],
    references: [siigoImportRuns.id],
  }),
}));

export const siigoMovementsRelations = relations(siigoMovements, ({ one }) => ({
  product: one(products, {
    fields: [siigoMovements.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [siigoMovements.warehouseId],
    references: [warehouses.id],
  }),
}));

export const salidasRelations = relations(salidas, ({ one, many }) => ({
  program: one(programs, {
    fields: [salidas.programId],
    references: [programs.id],
  }),
  warehouse: one(warehouses, {
    fields: [salidas.warehouseId],
    references: [warehouses.id],
  }),
  user: one(users, {
    fields: [salidas.userId],
    references: [users.id],
  }),
  items: many(salidaItems),
  reservations: many(siigoReservations),
}));

export const salidaItemsRelations = relations(salidaItems, ({ one }) => ({
  salida: one(salidas, {
    fields: [salidaItems.salidaId],
    references: [salidas.id],
  }),
  product: one(products, {
    fields: [salidaItems.productId],
    references: [products.id],
  }),
  reservation: one(siigoReservations),
}));

export const siigoReservationsRelations = relations(siigoReservations, ({ one }) => ({
  salida: one(salidas, {
    fields: [siigoReservations.salidaId],
    references: [salidas.id],
  }),
  salidaItem: one(salidaItems, {
    fields: [siigoReservations.salidaItemId],
    references: [salidaItems.id],
  }),
  product: one(products, {
    fields: [siigoReservations.productId],
    references: [products.id],
  }),
}));

export const featureFlagsRelations = relations(featureFlags, ({ one }) => ({
  updatedBy: one(users, {
    fields: [featureFlags.updatedBy],
    references: [users.id],
  }),
}));
