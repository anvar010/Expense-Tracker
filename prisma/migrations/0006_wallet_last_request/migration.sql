-- What the last Apple Pay request did and carried, shown on the Apple Pay page for troubleshooting.
ALTER TABLE `wallet_keys`
    ADD COLUMN `last_attempt_at` DATETIME(3) NULL,
    ADD COLUMN `last_status` VARCHAR(200) NULL,
    ADD COLUMN `last_body` VARCHAR(400) NULL;
