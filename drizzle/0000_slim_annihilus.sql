CREATE TABLE `lexi_backup_history` (
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `lexi_backups` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL,
	`write_id` text NOT NULL
);
