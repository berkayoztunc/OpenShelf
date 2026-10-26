CREATE TABLE `slug_redirects` (
	`old_path` text PRIMARY KEY NOT NULL,
	`new_path` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `categories` ADD `seo_title` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `seo_description` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `seo_og_image_url` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `seo_noindex` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `seo_og_media_id` text;--> statement-breakpoint
ALTER TABLE `products` ADD `seo_og_image_url` text;--> statement-breakpoint
ALTER TABLE `products` ADD `seo_noindex` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `seo_canonical` text;