CREATE TABLE `channel_product_settings` (
	`product_id` text NOT NULL,
	`channel` text NOT NULL,
	`content_source` text DEFAULT 'local' NOT NULL,
	`price_source` text DEFAULT 'local' NOT NULL,
	`last_pulled_at` integer,
	`last_pull_error` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`product_id`, `channel`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
