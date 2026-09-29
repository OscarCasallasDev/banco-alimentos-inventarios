CREATE TYPE "public"."audit_log_action" AS ENUM('LOGIN', 'LOGOUT', 'PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRODUCT_DEACTIVATE', 'ENTRY_CREATE', 'ENTRY_CONFIRM', 'EXIT_CREATE', 'ORDER_CREATE', 'INVOICE_CREATE', 'RECEIPT_CREATE', 'DISPATCH_CREATE', 'AUDIT_CREATE', 'EXPORT', 'IMPORT', 'SIIGO_OPERATION', 'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE');--> statement-breakpoint
CREATE TYPE "public"."audit_status" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."dispatch_status" AS ENUM('PENDING', 'PREPARED', 'DISPATCHED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('ENTRY', 'ORDER', 'INVOICE', 'RECEIPT', 'DISPATCH');--> statement-breakpoint
CREATE TYPE "public"."entry_format" AS ENUM('E1', 'E3', 'N3', 'N5');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('DRAFT', 'CONFIRMED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."invoice_format" AS ENUM('SF1', 'F2');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'GENERATED', 'ASSOCIATED_TO_RECEIPT', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('ENTRY', 'EXIT', 'ADJUSTMENT', 'AUDIT');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'APPROVED', 'INVOICED', 'DISPATCHED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('ACTIVE', 'INACTIVE', 'DISCONTINUED');--> statement-breakpoint
CREATE TYPE "public"."receipt_format" AS ENUM('R1', 'R2', 'R3', 'R4');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('DRAFT', 'GENERATED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SUPERADMIN', 'ADMIN', 'RECEPCION', 'DESPACHO', 'CONTABILIDAD');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."warehouse_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."warehouse_type" AS ENUM('PROPIA', 'TERCERO', 'CAMPAIGN', 'PROGRAM');--> statement-breakpoint
CREATE TABLE "audit_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"system_quantity" integer NOT NULL,
	"physical_quantity" integer NOT NULL,
	"difference" integer NOT NULL,
	"observation" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" "audit_log_action" NOT NULL,
	"entity" varchar(100) NOT NULL,
	"entity_id" uuid,
	"result" varchar(20) NOT NULL,
	"details" text,
	"ip_address" "inet",
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"responsible" varchar(255) NOT NULL,
	"status" "audit_status" DEFAULT 'PENDING' NOT NULL,
	"user_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(50) NOT NULL,
	"receipt_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "dispatch_status" DEFAULT 'PENDING' NOT NULL,
	"user_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "document_type" NOT NULL,
	"number" varchar(50) NOT NULL,
	"related_id" uuid NOT NULL,
	"generated_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"format" "entry_format" NOT NULL,
	"number" varchar(50) NOT NULL,
	"date" date NOT NULL,
	"nit" varchar(50),
	"origin" varchar(255),
	"document" varchar(100),
	"status" "entry_status" DEFAULT 'DRAFT' NOT NULL,
	"user_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit" varchar(20) NOT NULL,
	"presentation" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"last_movement_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "movement_type" NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"document_id" uuid,
	"document_type" varchar(50),
	"user_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"format" "invoice_format" NOT NULL,
	"number" varchar(50) NOT NULL,
	"order_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(50) NOT NULL,
	"date" date NOT NULL,
	"nit" varchar(50),
	"destination" varchar(255),
	"status" "order_status" DEFAULT 'DRAFT' NOT NULL,
	"user_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"presentation" varchar(100),
	"weight" numeric(10, 2) DEFAULT '0' NOT NULL,
	"unit" varchar(20) DEFAULT 'unidad' NOT NULL,
	"category_id" uuid,
	"status" "product_status" DEFAULT 'ACTIVE' NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"format" "receipt_format" NOT NULL,
	"number" varchar(50) NOT NULL,
	"invoice_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "receipt_status" DEFAULT 'DRAFT' NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" "user_role" NOT NULL,
	"description" text NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(100) NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"role" "user_role" DEFAULT 'RECEPCION' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" "warehouse_type" DEFAULT 'PROPIA' NOT NULL,
	"status" "warehouse_status" DEFAULT 'ACTIVE' NOT NULL,
	"observations" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "warehouses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "audit_items" ADD CONSTRAINT "audit_items_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_items" ADD CONSTRAINT "audit_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_items" ADD CONSTRAINT "entry_items_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_items" ADD CONSTRAINT "entry_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_items" ADD CONSTRAINT "entry_items_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_items_audit" ON "audit_items" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "idx_audit_items_product" ON "audit_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_logs_user" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_logs_created" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audits_date" ON "audits" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_audits_status" ON "audits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_audits_warehouse" ON "audits" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_dispatch_items_dispatch" ON "dispatch_items" USING btree ("dispatch_id");--> statement-breakpoint
CREATE INDEX "idx_dispatch_items_product" ON "dispatch_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_dispatches_date" ON "dispatches" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_dispatches_status" ON "dispatches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_dispatches_receipt" ON "dispatches" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "idx_documents_type" ON "documents" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_documents_related" ON "documents" USING btree ("related_id");--> statement-breakpoint
CREATE INDEX "idx_entries_date" ON "entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_entries_status" ON "entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_entries_user" ON "entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_entry_items_entry" ON "entry_items" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_entry_items_product" ON "entry_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_inventory_product_warehouse" ON "inventory" USING btree ("product_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_product" ON "inventory" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_warehouse" ON "inventory" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_movements_product" ON "inventory_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_movements_warehouse" ON "inventory_movements" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_movements_user" ON "inventory_movements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_movements_created" ON "inventory_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_movements_type" ON "inventory_movements" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_invoice_items_invoice" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_items_product" ON "invoice_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_date" ON "invoices" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_invoices_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_invoices_order" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_order" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_product" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_orders_date" ON "orders" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_orders_user" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_products_code" ON "products" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_products_category" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_products_status" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_receipts_date" ON "receipts" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_receipts_status" ON "receipts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_receipts_invoice" ON "receipts" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_users_username" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_users_status" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_warehouses_code" ON "warehouses" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_warehouses_status" ON "warehouses" USING btree ("status");