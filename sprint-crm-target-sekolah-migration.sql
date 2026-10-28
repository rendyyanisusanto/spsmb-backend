-- ========================================================
-- Migration: Sprint CRM - Target Sekolah & Presentasi SPMB
-- Target Tables:
-- 1. crm_school_targets
-- 2. crm_school_target_status_histories
-- 3. crm_school_letter_settings
-- 4. crm_school_target_letters
-- 5. crm_school_presentation_reports
-- 6. crm_school_presentation_photos
-- ========================================================

-- 1. Tabel Target Sekolah
CREATE TABLE IF NOT EXISTS `crm_school_targets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `school_name` VARCHAR(200) NOT NULL,
  `education_level` VARCHAR(30) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `village` VARCHAR(120) DEFAULT NULL,
  `district` VARCHAR(120) DEFAULT NULL,
  `city_regency` VARCHAR(120) DEFAULT NULL,
  `province` VARCHAR(120) DEFAULT NULL,
  `principal_name` VARCHAR(150) DEFAULT NULL,
  `contact_person` VARCHAR(150) DEFAULT NULL,
  `contact_position` VARCHAR(120) DEFAULT NULL,
  `phone` VARCHAR(40) DEFAULT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `source` VARCHAR(150) DEFAULT NULL,
  `status` ENUM('LEADS','FOLLOWED_UP','REJECTED','SCHEDULED','COMPLETED') NOT NULL DEFAULT 'LEADS',
  `first_follow_up_at` DATETIME DEFAULT NULL,
  `scheduled_at` DATETIME DEFAULT NULL,
  `scheduled_location` VARCHAR(255) DEFAULT NULL,
  `rejection_reason` TEXT DEFAULT NULL,
  `team_text` TEXT DEFAULT NULL,
  `internal_notes` TEXT DEFAULT NULL,
  `created_by` BIGINT UNSIGNED DEFAULT NULL,
  `updated_by` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_crm_school_targets_name` (`school_name`),
  INDEX `idx_crm_school_targets_status` (`status`),
  INDEX `idx_crm_school_targets_schedule` (`scheduled_at`),
  INDEX `idx_crm_school_targets_district` (`district`, `city_regency`),
  INDEX `idx_crm_school_targets_created` (`created_at`),
  INDEX `fk_crm_school_targets_created_by` (`created_by`),
  INDEX `fk_crm_school_targets_updated_by` (`updated_by`),
  CONSTRAINT `fk_crm_school_targets_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_school_targets_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabel Riwayat Status Target Sekolah
CREATE TABLE IF NOT EXISTS `crm_school_target_status_histories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `school_target_id` BIGINT UNSIGNED NOT NULL,
  `old_status` ENUM('LEADS','FOLLOWED_UP','REJECTED','SCHEDULED','COMPLETED') DEFAULT NULL,
  `new_status` ENUM('LEADS','FOLLOWED_UP','REJECTED','SCHEDULED','COMPLETED') NOT NULL,
  `note` TEXT DEFAULT NULL,
  `changed_by` BIGINT UNSIGNED DEFAULT NULL,
  `changed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_crm_school_status_target_date` (`school_target_id`, `changed_at`),
  INDEX `idx_crm_school_status_changed_by` (`changed_by`),
  CONSTRAINT `fk_crm_school_status_target` FOREIGN KEY (`school_target_id`) REFERENCES `crm_school_targets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_school_status_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabel Pengaturan Surat Presentasi
CREATE TABLE IF NOT EXISTS `crm_school_letter_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `setting_name` VARCHAR(150) NOT NULL DEFAULT 'Default',
  `school_name` VARCHAR(200) DEFAULT NULL,
  `school_address` TEXT DEFAULT NULL,
  `school_phone` VARCHAR(60) DEFAULT NULL,
  `school_email` VARCHAR(150) DEFAULT NULL,
  `school_website` VARCHAR(150) DEFAULT NULL,
  `letterhead_logo_path` VARCHAR(500) DEFAULT NULL,
  `letterhead_image_path` VARCHAR(500) DEFAULT NULL,
  `letterhead_extra_text` TEXT DEFAULT NULL,
  `letter_number_prefix` VARCHAR(100) DEFAULT NULL,
  `letter_number_format` VARCHAR(255) DEFAULT NULL,
  `letter_body_template` LONGTEXT DEFAULT NULL,
  `closing_text` TEXT DEFAULT NULL,
  `principal_name` VARCHAR(150) DEFAULT NULL,
  `principal_title` VARCHAR(150) DEFAULT NULL,
  `principal_nip` VARCHAR(80) DEFAULT NULL,
  `principal_signature_path` VARCHAR(500) DEFAULT NULL,
  `spmb_chair_name` VARCHAR(150) DEFAULT NULL,
  `spmb_chair_title` VARCHAR(150) DEFAULT NULL,
  `spmb_chair_nip` VARCHAR(80) DEFAULT NULL,
  `spmb_chair_signature_path` VARCHAR(500) DEFAULT NULL,
  `default_city` VARCHAR(120) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` BIGINT UNSIGNED DEFAULT NULL,
  `updated_by` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_crm_school_letter_settings_active` (`is_active`),
  INDEX `fk_crm_school_letter_settings_created_by` (`created_by`),
  INDEX `fk_crm_school_letter_settings_updated_by` (`updated_by`),
  CONSTRAINT `fk_crm_school_letter_settings_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_school_letter_settings_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabel Penerbitan / Snapshot Surat Target Sekolah
CREATE TABLE IF NOT EXISTS `crm_school_target_letters` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `school_target_id` BIGINT UNSIGNED NOT NULL,
  `letter_settings_id` BIGINT UNSIGNED DEFAULT NULL,
  `letter_number` VARCHAR(120) NOT NULL,
  `issue_date` DATE NOT NULL,
  `recipient_name_snapshot` VARCHAR(200) DEFAULT NULL,
  `school_name_snapshot` VARCHAR(200) NOT NULL,
  `address_snapshot` TEXT DEFAULT NULL,
  `letter_content_snapshot` LONGTEXT DEFAULT NULL,
  `signer_snapshot` LONGTEXT DEFAULT NULL COMMENT 'Snapshot JSON data penandatangan saat diterbitkan',
  `generated_by` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_crm_school_target_letter_number` (`letter_number`),
  INDEX `idx_crm_school_target_letters_target_date` (`school_target_id`, `issue_date`),
  INDEX `fk_crm_school_target_letters_settings` (`letter_settings_id`),
  INDEX `fk_crm_school_target_letters_user` (`generated_by`),
  CONSTRAINT `fk_crm_school_target_letters_settings` FOREIGN KEY (`letter_settings_id`) REFERENCES `crm_school_letter_settings` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_school_target_letters_target` FOREIGN KEY (`school_target_id`) REFERENCES `crm_school_targets` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_school_target_letters_user` FOREIGN KEY (`generated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabel Laporan Presentasi SPMB di Sekolah Sasaran
CREATE TABLE IF NOT EXISTS `crm_school_presentation_reports` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `school_target_id` BIGINT UNSIGNED NOT NULL,
  `held_at` DATETIME NOT NULL,
  `location` VARCHAR(255) DEFAULT NULL,
  `team_text` TEXT DEFAULT NULL,
  `participant_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `summary` LONGTEXT DEFAULT NULL,
  `evaluation` LONGTEXT DEFAULT NULL,
  `school_response` TEXT DEFAULT NULL,
  `obstacles` TEXT DEFAULT NULL,
  `follow_up_plan` TEXT DEFAULT NULL,
  `additional_notes` TEXT DEFAULT NULL,
  `created_by` BIGINT UNSIGNED DEFAULT NULL,
  `updated_by` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_crm_school_presentation_target_date` (`school_target_id`, `held_at`),
  INDEX `fk_crm_school_presentation_created_by` (`created_by`),
  INDEX `fk_crm_school_presentation_updated_by` (`updated_by`),
  CONSTRAINT `fk_crm_school_presentation_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_school_presentation_target` FOREIGN KEY (`school_target_id`) REFERENCES `crm_school_targets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_school_presentation_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabel Dokumentasi Foto Laporan Presentasi
CREATE TABLE IF NOT EXISTS `crm_school_presentation_photos` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `presentation_report_id` BIGINT UNSIGNED NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `original_filename` VARCHAR(255) DEFAULT NULL,
  `mime_type` VARCHAR(100) DEFAULT NULL,
  `file_size_bytes` BIGINT UNSIGNED DEFAULT NULL,
  `caption` VARCHAR(255) DEFAULT NULL,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  `uploaded_by` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_crm_school_presentation_photos_report` (`presentation_report_id`, `sort_order`),
  INDEX `fk_crm_school_presentation_photos_user` (`uploaded_by`),
  CONSTRAINT `fk_crm_school_presentation_photos_report` FOREIGN KEY (`presentation_report_id`) REFERENCES `crm_school_presentation_reports` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_crm_school_presentation_photos_user` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
