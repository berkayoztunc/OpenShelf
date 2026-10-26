CREATE TABLE `mock_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trendyol_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operation_id` text NOT NULL,
	`method` text NOT NULL,
	`env` text NOT NULL,
	`mock` integer DEFAULT false NOT NULL,
	`risk` text NOT NULL,
	`status` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`admin_id` text,
	`request_summary` text,
	`response_summary` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trendyol_calls_at_idx` ON `trendyol_calls` (`created_at`);--> statement-breakpoint
CREATE INDEX `trendyol_calls_op_idx` ON `trendyol_calls` (`operation_id`);