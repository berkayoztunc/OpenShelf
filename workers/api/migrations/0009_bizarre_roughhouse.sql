CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`level` text DEFAULT 'read' NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_hash_u` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_tokens_admin_idx` ON `api_tokens` (`admin_id`);