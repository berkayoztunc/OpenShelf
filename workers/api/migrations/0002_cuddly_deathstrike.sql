CREATE TABLE `mock_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel` text NOT NULL,
	`to` text,
	`subject` text,
	`body` text,
	`meta` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mock_messages_at_idx` ON `mock_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `notification_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`event` text NOT NULL,
	`channel` text NOT NULL,
	`to` text,
	`provider` text,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_log_u` ON `notification_log` (`order_id`,`event`,`channel`);