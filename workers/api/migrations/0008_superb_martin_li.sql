CREATE TABLE `campaign_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`to` text NOT NULL,
	`name` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`sent_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_recipients_u` ON `campaign_recipients` (`campaign_id`,`customer_id`);--> statement-breakpoint
CREATE INDEX `campaign_recipients_st` ON `campaign_recipients` (`campaign_id`,`status`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`channel` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`filters` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `campaigns_at_idx` ON `campaigns` (`created_at`);--> statement-breakpoint
CREATE TABLE `outbound_sms` (
	`id` text PRIMARY KEY NOT NULL,
	`to` text NOT NULL,
	`text` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider` text,
	`provider_message_id` text,
	`error` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE INDEX `outbound_sms_at_idx` ON `outbound_sms` (`created_at`);