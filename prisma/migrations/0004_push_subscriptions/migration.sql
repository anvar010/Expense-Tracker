-- Browser push subscriptions (one per device) for new-transaction alerts.
CREATE TABLE `push_subscriptions` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `endpoint` VARCHAR(700) NOT NULL,
    `p256dh` VARCHAR(200) NOT NULL,
    `auth` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `push_subscriptions_endpoint_key`(`endpoint`),
    INDEX `push_subscriptions_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
