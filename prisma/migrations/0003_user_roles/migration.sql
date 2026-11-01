-- User roles: one super admin who manages users, and regular users.
ALTER TABLE `users`
    ADD COLUMN `role` ENUM('SUPER_ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true;

-- The earliest existing account becomes the first super admin.
UPDATE `users` SET `role` = 'SUPER_ADMIN'
WHERE `id` = (SELECT `id` FROM (SELECT `id` FROM `users` ORDER BY `created_at` ASC LIMIT 1) AS first_user);
