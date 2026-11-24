CREATE TABLE `manual_shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`recipient` text NOT NULL,
	`contents` text NOT NULL,
	`note` text,
	`customer_id` text,
	`order_id` text,
	`weight_grams` integer NOT NULL,
	`desi` integer,
	`provider` text NOT NULL,
	`service_id` text NOT NULL,
	`provider_shipment_id` text,
	`carrier` text,
	`tracking_number` text,
	`tracking_url` text,
	`label_url` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manual_shipments_reference_unique` ON `manual_shipments` (`reference`);--> statement-breakpoint
CREATE INDEX `manual_shipments_status_idx` ON `manual_shipments` (`status`,`created_at`);