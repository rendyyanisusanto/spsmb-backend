const path = require('path');
const fs = require('fs');
const pool = require('../config/database');
const crmSchoolTargetRepository = require('../repositories/crmSchoolTargetRepository');
const auditService = require('./auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');
const { CRM_SCHOOL_STATUS, CRM_SCHOOL_STATUS_LABELS } = require('../constants/crmSchoolStatus');

class CrmSchoolTargetService {
  // Helper to convert month index (1-12) to Roman numerals
  _getRomanMonth(monthNumber) {
    const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    return romanMonths[monthNumber - 1] || 'I';
  }

  // Format date or ISO string to MySQL DATETIME (YYYY-MM-DD HH:MM:SS)
  _toMysqlDatetime(val) {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  // Format date to Indonesian text (e.g. 27 Oktober 2026)
  _formatIndonesianDate(dateInput) {
    const date = dateInput ? new Date(dateInput) : new Date();
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  // Replace placeholders in template text
  _renderPlaceholders(templateText, replacements) {
    if (!templateText) return '';
    let rendered = templateText;
    for (const [key, val] of Object.entries(replacements)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, val !== null && val !== undefined ? val : '');
    }
    // Clean out Word/Office XML tags (e.g. <o:p>) and comments that break SVG rendering
    return rendered
      .replace(/<\/?\w+:\w+[^>]*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
  }

  // --- Target Sekolah ---
  async getTargets(params) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));

    const [targets, total, stats] = await Promise.all([
      crmSchoolTargetRepository.findTargets({ ...params, page, limit }),
      crmSchoolTargetRepository.countTargets(params),
      crmSchoolTargetRepository.getTargetStats(params)
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: targets.map(t => ({
        ...t,
        status_label: CRM_SCHOOL_STATUS_LABELS[t.status] || t.status
      })),
      meta: {
        page,
        limit,
        total,
        totalPages,
        stats
      }
    };
  }

  async getTargetStats(params) {
    return crmSchoolTargetRepository.getTargetStats(params);
  }

  async checkDuplicate(schoolName, cityRegency, excludeId) {
    return crmSchoolTargetRepository.findPotentialDuplicates(schoolName, cityRegency, excludeId);
  }

  async getTargetById(id) {
    const target = await crmSchoolTargetRepository.findById(id);
    if (!target) {
      const err = new Error('Data target sekolah tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }
    target.status_label = CRM_SCHOOL_STATUS_LABELS[target.status] || target.status;
    return target;
  }

  async createTarget(data, user, req = null) {
    if (!data.school_name || data.school_name.trim() === '') {
      const err = new Error('Nama sekolah wajib diisi.');
      err.statusCode = 422;
      throw err;
    }

    const validStatuses = Object.values(CRM_SCHOOL_STATUS);
    const status = data.status && validStatuses.includes(data.status) ? data.status : CRM_SCHOOL_STATUS.LEADS;

    if (status === CRM_SCHOOL_STATUS.COMPLETED) {
      const err = new Error('Status "Selesai" (COMPLETED) hanya dapat dipilih setelah minimal ada 1 laporan presentasi yang tersimpan.');
      err.statusCode = 422;
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const targetData = {
        school_name: data.school_name.trim(),
        education_level: data.education_level || null,
        address: data.address || null,
        village: data.village || null,
        district: data.district || null,
        city_regency: data.city_regency || null,
        province: data.province || null,
        principal_name: data.principal_name || null,
        contact_person: data.contact_person || null,
        contact_position: data.contact_position || null,
        phone: data.phone || null,
        email: data.email || null,
        source: data.source || null,
        status,
        first_follow_up_at: status === CRM_SCHOOL_STATUS.FOLLOWED_UP ? this._toMysqlDatetime(data.first_follow_up_at || new Date()) : this._toMysqlDatetime(data.first_follow_up_at),
        scheduled_at: this._toMysqlDatetime(data.scheduled_at),
        scheduled_location: data.scheduled_location || null,
        rejection_reason: data.rejection_reason || null,
        team_text: data.team_text || null,
        internal_notes: data.internal_notes || null,
        created_by: user ? user.id : null,
        updated_by: user ? user.id : null
      };

      const newId = await crmSchoolTargetRepository.create(targetData, connection);

      // Record initial status history
      await crmSchoolTargetRepository.createStatusHistory({
        school_target_id: newId,
        old_status: null,
        new_status: status,
        note: data.initial_note || 'Pencatatan target sekolah baru',
        changed_by: user ? user.id : null
      }, connection);

      await auditService.log(
        AUDIT_ACTIONS.CRM_SCHOOL_TARGET_CREATE,
        'CRM_SCHOOL_TARGET',
        newId,
        `Menambahkan target sekolah baru: "${data.school_name.trim()}"`,
        req,
        connection
      );

      await connection.commit();
      return this.getTargetById(newId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateTarget(id, data, user, req = null) {
    const existing = await crmSchoolTargetRepository.findById(id);
    if (!existing) {
      const err = new Error('Data target sekolah tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    if (data.school_name !== undefined && (!data.school_name || data.school_name.trim() === '')) {
      const err = new Error('Nama sekolah tidak boleh kosong.');
      err.statusCode = 422;
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const updatePayload = {
        ...data,
        updated_by: user ? user.id : null
      };

      // If status is being updated directly in edit form, handle transition
      if (data.status && data.status !== existing.status) {
        const validStatuses = Object.values(CRM_SCHOOL_STATUS);
        if (!validStatuses.includes(data.status)) {
          const err = new Error('Status target sekolah tidak valid.');
          err.statusCode = 422;
          throw err;
        }

        // Validate COMPLETED requires at least 1 presentation report
        if (data.status === CRM_SCHOOL_STATUS.COMPLETED) {
          const reportCount = await crmSchoolTargetRepository.countReportsByTargetId(id, connection);
          if (reportCount === 0) {
            const err = new Error('Status "Selesai" (COMPLETED) hanya dapat dipilih setelah minimal ada 1 laporan presentasi yang tersimpan.');
            err.statusCode = 422;
            throw err;
          }
        }

        if (data.status === CRM_SCHOOL_STATUS.FOLLOWED_UP && !existing.first_follow_up_at && !data.first_follow_up_at) {
          updatePayload.first_follow_up_at = this._toMysqlDatetime(new Date());
        }

        await crmSchoolTargetRepository.createStatusHistory({
          school_target_id: id,
          old_status: existing.status,
          new_status: data.status,
          note: data.status_note || 'Perubahan status melalui edit target sekolah',
          changed_by: user ? user.id : null
        }, connection);

        await auditService.log(
          AUDIT_ACTIONS.CRM_SCHOOL_TARGET_STATUS_CHANGE,
          'CRM_SCHOOL_TARGET',
          id,
          `Mengubah status target sekolah "${existing.school_name}" dari ${existing.status} ke ${data.status}`,
          req,
          connection
        );
      }

      if (data.first_follow_up_at !== undefined) {
        updatePayload.first_follow_up_at = this._toMysqlDatetime(data.first_follow_up_at);
      }
      if (data.scheduled_at !== undefined) {
        updatePayload.scheduled_at = this._toMysqlDatetime(data.scheduled_at);
      }

      await crmSchoolTargetRepository.update(id, updatePayload, connection);

      await auditService.log(
        AUDIT_ACTIONS.CRM_SCHOOL_TARGET_UPDATE,
        'CRM_SCHOOL_TARGET',
        id,
        `Memperbarui informasi target sekolah: "${existing.school_name}"`,
        req,
        connection
      );

      await connection.commit();
      return this.getTargetById(id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateStatus(id, { status, note, scheduled_at, scheduled_location, rejection_reason }, user, req = null) {
    const existing = await crmSchoolTargetRepository.findById(id);
    if (!existing) {
      const err = new Error('Data target sekolah tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const validStatuses = Object.values(CRM_SCHOOL_STATUS);
    if (!validStatuses.includes(status)) {
      const err = new Error('Status target sekolah tidak valid.');
      err.statusCode = 422;
      throw err;
    }

    if (existing.status === status) {
      const err = new Error('Status target sekolah sudah bernilai ' + (CRM_SCHOOL_STATUS_LABELS[status] || status));
      err.statusCode = 400;
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Enforce: COMPLETED status requires at least 1 presentation report
      if (status === CRM_SCHOOL_STATUS.COMPLETED) {
        const reportCount = await crmSchoolTargetRepository.countReportsByTargetId(id, connection);
        if (reportCount === 0) {
          const err = new Error('Status "Selesai" (COMPLETED) hanya dapat dipilih setelah minimal ada 1 laporan presentasi yang tersimpan.');
          err.statusCode = 422;
          throw err;
        }
      }

      const updates = {
        status,
        updated_by: user ? user.id : null
      };

      if (status === CRM_SCHOOL_STATUS.FOLLOWED_UP && !existing.first_follow_up_at) {
        updates.first_follow_up_at = this._toMysqlDatetime(new Date());
      }

      if (scheduled_at !== undefined) {
        updates.scheduled_at = this._toMysqlDatetime(scheduled_at);
      }
      if (scheduled_location !== undefined) {
        updates.scheduled_location = scheduled_location || null;
      }
      if (rejection_reason !== undefined) {
        updates.rejection_reason = rejection_reason || null;
      }

      await crmSchoolTargetRepository.update(id, updates, connection);

      await crmSchoolTargetRepository.createStatusHistory({
        school_target_id: id,
        old_status: existing.status,
        new_status: status,
        note: note || `Status diubah menjadi ${CRM_SCHOOL_STATUS_LABELS[status] || status}`,
        changed_by: user ? user.id : null
      }, connection);

      await auditService.log(
        AUDIT_ACTIONS.CRM_SCHOOL_TARGET_STATUS_CHANGE,
        'CRM_SCHOOL_TARGET',
        id,
        `Mengubah status target sekolah "${existing.school_name}" dari ${existing.status} ke ${status}. Catatan: ${note || '-'}`,
        req,
        connection
      );

      await connection.commit();
      return this.getTargetById(id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteTarget(id, user, req = null) {
    const existing = await crmSchoolTargetRepository.findById(id);
    if (!existing) {
      const err = new Error('Data target sekolah tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    if (existing.letters_count > 0) {
      const err = new Error('Target sekolah tidak dapat dihapus karena telah memiliki surat permohonan yang diterbitkan.');
      err.statusCode = 400;
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await crmSchoolTargetRepository.delete(id, connection);

      await auditService.log(
        AUDIT_ACTIONS.CRM_SCHOOL_TARGET_DELETE,
        'CRM_SCHOOL_TARGET',
        id,
        `Menghapus target sekolah: "${existing.school_name}"`,
        req,
        connection
      );

      await connection.commit();
      return { success: true, message: 'Target sekolah berhasil dihapus.' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getStatusHistories(schoolTargetId) {
    const target = await crmSchoolTargetRepository.findById(schoolTargetId);
    if (!target) {
      const err = new Error('Data target sekolah tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }
    return crmSchoolTargetRepository.findStatusHistories(schoolTargetId);
  }

  // --- Letter Settings ---
  async getActiveLetterSettings() {
    return crmSchoolTargetRepository.getActiveLetterSettings();
  }

  async updateLetterSettings(payload, user, req = null) {
    const activeSetting = await crmSchoolTargetRepository.getActiveLetterSettings();

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const updateData = {
        ...payload,
        updated_by: user ? user.id : null
      };

      if (updateData.letter_body_template) {
        updateData.letter_body_template = updateData.letter_body_template
          .replace(/<\/?\w+:\w+[^>]*>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '');
      }

      await crmSchoolTargetRepository.updateLetterSettings(activeSetting.id, updateData, connection);

      await auditService.log(
        AUDIT_ACTIONS.CRM_SCHOOL_LETTER_SETTINGS_UPDATE,
        'CRM_SCHOOL_LETTER_SETTINGS',
        activeSetting.id,
        'Memperbarui konfigurasi surat permohonan presentasi dan data penandatangan',
        req,
        connection
      );

      await connection.commit();
      return crmSchoolTargetRepository.getActiveLetterSettings();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // --- Letter Preview & Issuance ---
  async previewLetter(schoolTargetId, params = {}) {
    const target = await crmSchoolTargetRepository.findById(schoolTargetId);
    if (!target) {
      const err = new Error('Data target sekolah tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const settings = await crmSchoolTargetRepository.getActiveLetterSettings();

    const issueDate = params.issue_date ? new Date(params.issue_date) : new Date();
    const formattedDate = this._formatIndonesianDate(issueDate);

    // Sample / draft letter number for preview
    const year = issueDate.getFullYear();
    const romanMonth = this._getRomanMonth(issueDate.getMonth() + 1);
    const prefix = settings.letter_number_prefix || 'SPMB/PRES';
    const sampleNumber = `[DRAFT]/${prefix}/${romanMonth}/${year}`;

    const replacements = {
      nama_sekolah_tujuan: target.school_name || '',
      nama_kepala_sekolah_tujuan: target.principal_name || target.contact_person || 'Bapak/Ibu Kepala Sekolah',
      alamat_sekolah_tujuan: [target.address, target.district, target.city_regency].filter(Boolean).join(', ') || 'Tempat',
      tanggal_surat: formattedDate,
      nomor_surat: sampleNumber,
      telepon_sekolah_tujuan: target.phone || '',
      kontak_person_tujuan: target.contact_person || '',
      jabatan_kontak_tujuan: target.contact_position || '',
      kota_sekolah_tujuan: target.city_regency || '',
      kota_terbit: settings.default_city || 'Malang',
      nama_lembaga: settings.school_name || 'Panitia SPMB'
    };

    const renderedBody = this._renderPlaceholders(settings.letter_body_template, replacements);

    return {
      settings,
      target,
      sample_letter_number: sampleNumber,
      issue_date: issueDate.toISOString().split('T')[0],
      formatted_date: formattedDate,
      replacements,
      rendered_body: renderedBody
    };
  }

  async issueLetter(schoolTargetId, params = {}, user, req = null) {
    const target = await crmSchoolTargetRepository.findById(schoolTargetId);
    if (!target) {
      const err = new Error('Data target sekolah tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const settings = await crmSchoolTargetRepository.getActiveLetterSettings();

    const issueDate = params.issue_date ? new Date(params.issue_date) : new Date();
    const year = issueDate.getFullYear();
    const month = issueDate.getMonth() + 1;
    const romanMonth = this._getRomanMonth(month);
    const formattedDate = this._formatIndonesianDate(issueDate);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Concurrent-safe letter sequence generation
      const seq = await crmSchoolTargetRepository.getNextLetterSequence(year, connection);
      const paddedSeq = String(seq).padStart(3, '0');
      const prefix = settings.letter_number_prefix || 'SPMB/PRES';

      let generatedLetterNumber;
      if (settings.letter_number_format && settings.letter_number_format.includes('{num}')) {
        generatedLetterNumber = settings.letter_number_format
          .replace('{prefix}', prefix)
          .replace('{num}', paddedSeq)
          .replace('{month_rom}', romanMonth)
          .replace('{month}', String(month).padStart(2, '0'))
          .replace('{year}', year);
      } else {
        generatedLetterNumber = `${paddedSeq}/${prefix}/${romanMonth}/${year}`;
      }

      // Check if letter number already exists
      const existingLetter = await crmSchoolTargetRepository.findLetterByNumber(generatedLetterNumber, connection);
      if (existingLetter) {
        // Fallback salt to ensure strict uniqueness
        generatedLetterNumber = `${paddedSeq}-${Date.now().toString().slice(-4)}/${prefix}/${romanMonth}/${year}`;
      }

      const fullAddress = [target.address, target.district, target.city_regency].filter(Boolean).join(', ');

      const replacements = {
        nama_sekolah_tujuan: target.school_name || '',
        nama_kepala_sekolah_tujuan: target.principal_name || target.contact_person || 'Bapak/Ibu Kepala Sekolah',
        alamat_sekolah_tujuan: fullAddress || 'Tempat',
        tanggal_surat: formattedDate,
        nomor_surat: generatedLetterNumber,
        telepon_sekolah_tujuan: target.phone || '',
        kontak_person_tujuan: target.contact_person || '',
        jabatan_kontak_tujuan: target.contact_position || '',
        kota_sekolah_tujuan: target.city_regency || '',
        kota_terbit: settings.default_city || 'Malang',
        nama_lembaga: settings.school_name || 'Panitia SPMB'
      };

      const renderedBody = this._renderPlaceholders(settings.letter_body_template, replacements);

      const signerSnapshot = {
        letterhead: {
          school_name: settings.school_name,
          school_address: settings.school_address,
          school_phone: settings.school_phone,
          school_email: settings.school_email,
          school_website: settings.school_website,
          letterhead_logo_path: settings.letterhead_logo_path,
          letterhead_image_path: settings.letterhead_image_path,
          letterhead_extra_text: settings.letterhead_extra_text
        },
        principal: {
          name: settings.principal_name,
          title: settings.principal_title,
          nip: settings.principal_nip,
          signature_path: settings.principal_signature_path
        },
        spmb_chair: {
          name: settings.spmb_chair_name,
          title: settings.spmb_chair_title,
          nip: settings.spmb_chair_nip,
          signature_path: settings.spmb_chair_signature_path
        },
        closing_text: settings.closing_text,
        default_city: settings.default_city
      };

      const letterData = {
        school_target_id: schoolTargetId,
        letter_settings_id: settings.id,
        letter_number: generatedLetterNumber,
        issue_date: issueDate.toISOString().split('T')[0],
        recipient_name_snapshot: target.principal_name || target.contact_person,
        school_name_snapshot: target.school_name,
        address_snapshot: fullAddress,
        letter_content_snapshot: renderedBody,
        signer_snapshot: JSON.stringify(signerSnapshot),
        generated_by: user ? user.id : null
      };

      const letterId = await crmSchoolTargetRepository.createTargetLetter(letterData, connection);

      await auditService.log(
        AUDIT_ACTIONS.CRM_SCHOOL_LETTER_ISSUE,
        'CRM_SCHOOL_TARGET_LETTER',
        letterId,
        `Menerbitkan surat permohonan presentasi nomor: "${generatedLetterNumber}" untuk sekolah: "${target.school_name}"`,
        req,
        connection
      );

      await connection.commit();
      return crmSchoolTargetRepository.findLetterById(letterId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getLetters(schoolTargetId) {
    const target = await crmSchoolTargetRepository.findById(schoolTargetId);
    if (!target) {
      const err = new Error('Data target sekolah tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }
    return crmSchoolTargetRepository.findLettersByTargetId(schoolTargetId);
  }

  async getLetterById(letterId) {
    const letter = await crmSchoolTargetRepository.findLetterById(letterId);
    if (!letter) {
      const err = new Error('Data surat tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }
    if (letter.signer_snapshot && typeof letter.signer_snapshot === 'string') {
      try {
        letter.signer_snapshot = JSON.parse(letter.signer_snapshot);
      } catch (e) {
        // preserve as string
      }
    }
    return letter;
  }

  // --- Presentation Reports ---
  async getReports(schoolTargetId) {
    const target = await crmSchoolTargetRepository.findById(schoolTargetId);
    if (!target) {
      const err = new Error('Data target sekolah tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }
    return crmSchoolTargetRepository.findReportsByTargetId(schoolTargetId);
  }

  async getReportById(reportId) {
    const report = await crmSchoolTargetRepository.findReportById(reportId);
    if (!report) {
      const err = new Error('Data laporan presentasi tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }
    return report;
  }

  async createReport(schoolTargetId, data, user, req = null) {
    const target = await crmSchoolTargetRepository.findById(schoolTargetId);
    if (!target) {
      const err = new Error('Data target sekolah tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    if (!data.held_at) {
      const err = new Error('Waktu pelaksanaan presentasi wajib diisi.');
      err.statusCode = 422;
      throw err;
    }

    const participantCount = Number(data.participant_count);
    if (isNaN(participantCount) || participantCount < 0) {
      const err = new Error('Jumlah peserta harus berupa angka bulat lebih besar atau sama dengan 0.');
      err.statusCode = 422;
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const reportData = {
        school_target_id: schoolTargetId,
        held_at: this._toMysqlDatetime(data.held_at),
        location: data.location || null,
        team_text: data.team_text || null,
        participant_count: participantCount,
        summary: data.summary || null,
        evaluation: data.evaluation || null,
        school_response: data.school_response || null,
        obstacles: data.obstacles || null,
        follow_up_plan: data.follow_up_plan || null,
        additional_notes: data.additional_notes || null,
        created_by: user ? user.id : null,
        updated_by: user ? user.id : null
      };

      const reportId = await crmSchoolTargetRepository.createReport(reportData, connection);

      await auditService.log(
        AUDIT_ACTIONS.CRM_SCHOOL_PRESENTATION_REPORT_CREATE,
        'CRM_SCHOOL_PRESENTATION_REPORT',
        reportId,
        `Menambahkan laporan presentasi SPMB di sekolah: "${target.school_name}" (${participantCount} peserta)`,
        req,
        connection
      );

      await connection.commit();
      return this.getReportById(reportId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateReport(reportId, data, user, req = null) {
    const existing = await crmSchoolTargetRepository.findReportById(reportId);
    if (!existing) {
      const err = new Error('Data laporan presentasi tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    if (data.participant_count !== undefined) {
      const count = Number(data.participant_count);
      if (isNaN(count) || count < 0) {
        const err = new Error('Jumlah peserta harus berupa angka bulat lebih besar atau sama dengan 0.');
        err.statusCode = 422;
        throw err;
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const updateData = {
        ...data,
        updated_by: user ? user.id : null
      };
      if (data.held_at) {
        updateData.held_at = this._toMysqlDatetime(data.held_at);
      }

      await crmSchoolTargetRepository.updateReport(reportId, updateData, connection);

      await auditService.log(
        AUDIT_ACTIONS.CRM_SCHOOL_PRESENTATION_REPORT_UPDATE,
        'CRM_SCHOOL_PRESENTATION_REPORT',
        reportId,
        `Memperbarui laporan presentasi SPMB id #${reportId} (${existing.target_school_name})`,
        req,
        connection
      );

      await connection.commit();
      return this.getReportById(reportId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteReport(reportId, user, req = null) {
    const existing = await crmSchoolTargetRepository.findReportById(reportId);
    if (!existing) {
      const err = new Error('Data laporan presentasi tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Clean up photo files from storage
      if (existing.photos && existing.photos.length > 0) {
        for (const p of existing.photos) {
          try {
            const diskPath = path.join(process.cwd(), p.file_path.replace(/^\//, ''));
            if (fs.existsSync(diskPath)) {
              fs.unlinkSync(diskPath);
            }
          } catch (e) {
            console.warn('Gagal menghapus file foto fisik:', e.message);
          }
        }
      }

      await crmSchoolTargetRepository.deleteReport(reportId, connection);

      await auditService.log(
        AUDIT_ACTIONS.CRM_SCHOOL_PRESENTATION_REPORT_DELETE,
        'CRM_SCHOOL_PRESENTATION_REPORT',
        reportId,
        `Menghapus laporan presentasi SPMB id #${reportId} (${existing.target_school_name})`,
        req,
        connection
      );

      await connection.commit();
      return { success: true, message: 'Laporan presentasi berhasil dihapus.' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // --- Photos ---
  async addPhotoToReport(reportId, photoData, user, req = null) {
    const report = await crmSchoolTargetRepository.findReportById(reportId);
    if (!report) {
      const err = new Error('Data laporan presentasi tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const photoPayload = {
        presentation_report_id: reportId,
        file_path: photoData.file_path,
        original_filename: photoData.original_filename,
        mime_type: photoData.mime_type,
        file_size_bytes: photoData.file_size_bytes,
        caption: photoData.caption || null,
        sort_order: Number(photoData.sort_order) || 0,
        uploaded_by: user ? user.id : null
      };

      const photoId = await crmSchoolTargetRepository.createPhoto(photoPayload, connection);

      await auditService.log(
        AUDIT_ACTIONS.CRM_SCHOOL_PHOTO_UPLOAD,
        'CRM_SCHOOL_PRESENTATION_PHOTO',
        photoId,
        `Mengunggah foto dokumentasi untuk laporan presentasi id #${reportId}`,
        req,
        connection
      );

      await connection.commit();
      return crmSchoolTargetRepository.findPhotoById(photoId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deletePhoto(photoId, user, req = null) {
    const photo = await crmSchoolTargetRepository.findPhotoById(photoId);
    if (!photo) {
      const err = new Error('Data foto tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Clean up physical file
      try {
        const diskPath = path.join(process.cwd(), photo.file_path.replace(/^\//, ''));
        if (fs.existsSync(diskPath)) {
          fs.unlinkSync(diskPath);
        }
      } catch (e) {
        console.warn('Gagal menghapus file fisik foto:', e.message);
      }

      await crmSchoolTargetRepository.deletePhoto(photoId, connection);

      await auditService.log(
        AUDIT_ACTIONS.CRM_SCHOOL_PHOTO_DELETE,
        'CRM_SCHOOL_PRESENTATION_PHOTO',
        photoId,
        `Menghapus foto dokumentasi id #${photoId}`,
        req,
        connection
      );

      await connection.commit();
      return { success: true, message: 'Foto berhasil dihapus.' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new CrmSchoolTargetService();
