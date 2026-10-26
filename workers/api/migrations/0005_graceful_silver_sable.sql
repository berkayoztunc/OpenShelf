CREATE TABLE `manual_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`type` text,
	`order_id` text,
	`customer` text NOT NULL,
	`lines` text NOT NULL,
	`prices_include_tax` integer DEFAULT true NOT NULL,
	`currency` text DEFAULT 'TRY' NOT NULL,
	`issue_date` text,
	`notes` text,
	`total` integer DEFAULT 0 NOT NULL,
	`tax_total` integer DEFAULT 0 NOT NULL,
	`provider` text,
	`provider_invoice_id` text,
	`number` text,
	`pdf_url` text,
	`error` text,
	`created_by` text,
	`issued_by` text,
	`issued_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `manual_invoices_status_idx` ON `manual_invoices` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `outbound_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`to` text NOT NULL,
	`cc` text,
	`reply_to` text,
	`subject` text NOT NULL,
	`body_text` text NOT NULL,
	`body_html` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider` text,
	`provider_message_id` text,
	`error` text,
	`order_id` text,
	`customer_id` text,
	`manual_invoice_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE INDEX `outbound_emails_at_idx` ON `outbound_emails` (`created_at`);