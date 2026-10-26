ALTER TABLE `admins` ADD `last_totp_step` integer;--> statement-breakpoint
ALTER TABLE `carts` ADD `checked_out_order_id` text;--> statement-breakpoint
ALTER TABLE `coupons` ADD `max_uses_per_customer` integer;