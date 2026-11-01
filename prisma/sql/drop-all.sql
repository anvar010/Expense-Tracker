-- DANGER: deletes every table and all data in the connected database.
-- Includes tables from older versions (devices, message_imports) and Prisma's migration history.
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `ai_insights`;
DROP TABLE IF EXISTS `push_subscriptions`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `recurring_transactions`;
DROP TABLE IF EXISTS `budgets`;
DROP TABLE IF EXISTS `transactions`;
DROP TABLE IF EXISTS `merchant_rules`;
DROP TABLE IF EXISTS `merchants`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `accounts`;
DROP TABLE IF EXISTS `devices`;
DROP TABLE IF EXISTS `message_imports`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `_prisma_migrations`;

SET FOREIGN_KEY_CHECKS = 1;
