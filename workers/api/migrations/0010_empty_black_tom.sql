CREATE TABLE `mcp_tool_settings` (
	`tool` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
