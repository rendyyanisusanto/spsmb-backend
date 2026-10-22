const confirmationRepo = require('../repositories/confirmationRepository');
const confirmationService = require('../services/confirmationService');
const auditService = require('../services/auditService');

class ConfirmationController {
  // Helper to validate institution access
  validateInstitutionAccess(req, institutionId) {
    const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
    if (!isSuperAdmin && !req.user.institutions.includes(Number(institutionId))) {
      throw { status: 403, message: 'Anda tidak memiliki hak akses ke lembaga ini.' };
    }
  }

  // --- TRACKS ---
  async getTracks(req, res, next) {
    try {
      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      let targetInstitutionId = req.query.institution_id ? parseInt(req.query.institution_id) : null;

      if (!isSuperAdmin) {
        if (targetInstitutionId && !req.user.institutions.includes(targetInstitutionId)) {
          return res.status(403).json({ success: false, message: 'Akses ditolak ke lembaga ini.' });
        }
        if (!targetInstitutionId && req.user.institutions.length > 0) {
          targetInstitutionId = req.user.institutions[0];
        }
      }

      const academicYear = req.query.academic_year || null;
      const isActive = req.query.is_active !== undefined ? req.query.is_active === 'true' || req.query.is_active === '1' : null;

      const data = await confirmationRepo.getTracks(targetInstitutionId, academicYear, isActive);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async createTrack(req, res, next) {
    try {
      const { institution_id, name, code, academic_year, description, start_date, end_date, is_active } = req.body;
      if (!institution_id) {
        return res.status(422).json({ success: false, message: 'Lembaga wajib dipilih.' });
      }
      if (!name || !name.trim()) {
        return res.status(422).json({ success: false, message: 'Nama jalur/gelombang konfirmasi wajib diisi.' });
      }

      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      if (!isSuperAdmin && !req.user.institutions.includes(Number(institution_id))) {
        return res.status(403).json({ success: false, message: 'Anda tidak memiliki hak akses ke lembaga ini.' });
      }

      const id = await confirmationRepo.createTrack({
        institution_id: Number(institution_id),
        name: name.trim(),
        code: code?.trim() || null,
        academic_year: academic_year || '2027/2028',
        description: description?.trim() || null,
        start_date: start_date || null,
        end_date: end_date || null,
        is_active: is_active !== undefined ? is_active : 1,
        created_by: req.user.id
      });

      const newTrack = await confirmationRepo.getTrackById(id);
      res.status(201).json({ success: true, message: 'Jalur konfirmasi berhasil dibuat.', data: newTrack });
    } catch (err) {
      next(err);
    }
  }

  async updateTrack(req, res, next) {
    try {
      const id = parseInt(req.params.id);
      const track = await confirmationRepo.getTrackById(id);
      if (!track) {
        return res.status(404).json({ success: false, message: 'Jalur konfirmasi tidak ditemukan.' });
      }

      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      if (!isSuperAdmin && !req.user.institutions.includes(track.institution_id)) {
        return res.status(403).json({ success: false, message: 'Anda tidak memiliki hak akses ke lembaga ini.' });
      }

      const { name, code, academic_year, description, start_date, end_date, is_active } = req.body;
      await confirmationRepo.updateTrack(id, {
        name: name?.trim(),
        code: code?.trim(),
        academic_year,
        description: description?.trim(),
        start_date,
        end_date,
        is_active
      });

      const updated = await confirmationRepo.getTrackById(id);
      res.json({ success: true, message: 'Jalur konfirmasi berhasil diperbarui.', data: updated });
    } catch (err) {
      next(err);
    }
  }

  async deleteTrack(req, res, next) {
    try {
      const id = parseInt(req.params.id);
      const track = await confirmationRepo.getTrackById(id);
      if (!track) {
        return res.status(404).json({ success: false, message: 'Jalur konfirmasi tidak ditemukan.' });
      }

      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      if (!isSuperAdmin && !req.user.institutions.includes(track.institution_id)) {
        return res.status(403).json({ success: false, message: 'Anda tidak memiliki hak akses ke lembaga ini.' });
      }

      if (track.total_students > 0) {
        return res.status(422).json({
          success: false,
          message: 'Jalur konfirmasi ini sudah digunakan oleh data penerimaan peserta dan tidak dapat dihapus. Silakan nonaktifkan statusnya.'
        });
      }

      await confirmationRepo.deleteTrack(id);
      res.json({ success: true, message: 'Jalur konfirmasi berhasil dihapus.' });
    } catch (err) {
      next(err);
    }
  }

  // --- FEE COMPONENTS ---
  async getFeeComponents(req, res, next) {
    try {
      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      let targetInstitutionId = req.query.institution_id ? parseInt(req.query.institution_id) : null;

      if (!isSuperAdmin) {
        if (targetInstitutionId && !req.user.institutions.includes(targetInstitutionId)) {
          return res.status(403).json({ success: false, message: 'Akses ditolak ke lembaga ini.' });
        }
        if (!targetInstitutionId && req.user.institutions.length > 0) {
          targetInstitutionId = req.user.institutions[0];
        }
      }

      const trackId = req.query.confirmation_track_id ? parseInt(req.query.confirmation_track_id) : null;
      const isActive = req.query.is_active !== undefined ? req.query.is_active === 'true' || req.query.is_active === '1' : null;

      const data = await confirmationRepo.getFeeComponents(targetInstitutionId, trackId, isActive);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async createFeeComponent(req, res, next) {
    try {
      const { institution_id, confirmation_track_id, name, description, amount, is_required, is_active, order_index } = req.body;
      if (!institution_id) {
        return res.status(422).json({ success: false, message: 'Lembaga wajib dipilih.' });
      }
      if (!name || !name.trim()) {
        return res.status(422).json({ success: false, message: 'Nama komponen tagihan wajib diisi.' });
      }

      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      if (!isSuperAdmin && !req.user.institutions.includes(Number(institution_id))) {
        return res.status(403).json({ success: false, message: 'Akses ditolak ke lembaga ini.' });
      }

      const id = await confirmationRepo.createFeeComponent({
        institution_id: Number(institution_id),
        confirmation_track_id: confirmation_track_id ? Number(confirmation_track_id) : null,
        name: name.trim(),
        description: description?.trim() || null,
        amount: Number(amount) || 0,
        is_required: is_required !== undefined ? is_required : 1,
        is_active: is_active !== undefined ? is_active : 1,
        order_index: order_index || 1,
        created_by: req.user.id
      });

      const newComponent = await confirmationRepo.getFeeComponentById(id);
      res.status(201).json({ success: true, message: 'Komponen tagihan berhasil dibuat.', data: newComponent });
    } catch (err) {
      next(err);
    }
  }

  async updateFeeComponent(req, res, next) {
    try {
      const id = parseInt(req.params.id);
      const comp = await confirmationRepo.getFeeComponentById(id);
      if (!comp) {
        return res.status(404).json({ success: false, message: 'Komponen tagihan tidak ditemukan.' });
      }

      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      if (!isSuperAdmin && !req.user.institutions.includes(comp.institution_id)) {
        return res.status(403).json({ success: false, message: 'Akses ditolak ke lembaga ini.' });
      }

      const { name, description, amount, confirmation_track_id, is_required, is_active, order_index } = req.body;
      await confirmationRepo.updateFeeComponent(id, {
        name: name?.trim(),
        description: description?.trim(),
        amount: amount !== undefined ? Number(amount) : undefined,
        confirmation_track_id,
        is_required,
        is_active,
        order_index
      });

      const updated = await confirmationRepo.getFeeComponentById(id);
      res.json({ success: true, message: 'Komponen tagihan berhasil diperbarui.', data: updated });
    } catch (err) {
      next(err);
    }
  }

  async deleteFeeComponent(req, res, next) {
    try {
      const id = parseInt(req.params.id);
      const comp = await confirmationRepo.getFeeComponentById(id);
      if (!comp) {
        return res.status(404).json({ success: false, message: 'Komponen tagihan tidak ditemukan.' });
      }

      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      if (!isSuperAdmin && !req.user.institutions.includes(comp.institution_id)) {
        return res.status(403).json({ success: false, message: 'Akses ditolak ke lembaga ini.' });
      }

      await confirmationRepo.deleteFeeComponent(id);
      res.json({ success: true, message: 'Komponen tagihan berhasil dihapus.' });
    } catch (err) {
      next(err);
    }
  }

  // --- CONFIRMATION PROCESS ---
  async getApplicants(req, res, next) {
    try {
      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      let targetInstitutionId = req.query.institution_id ? parseInt(req.query.institution_id) : null;

      if (!isSuperAdmin) {
        if (targetInstitutionId && !req.user.institutions.includes(targetInstitutionId)) {
          return res.status(403).json({ success: false, message: 'Akses ditolak ke lembaga ini.' });
        }
        if (!targetInstitutionId && req.user.institutions.length > 0) {
          targetInstitutionId = req.user.institutions[0];
        }
      }

      const options = {
        institutionId: targetInstitutionId,
        academicYear: req.query.academic_year || null,
        status: req.query.status || null,
        docStatus: req.query.doc_status || null,
        payStatus: req.query.pay_status || null,
        search: req.query.q || '',
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20
      };

      const result = await confirmationRepo.getApplicantsForConfirmation(options);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  async getConfirmationDetail(req, res, next) {
    try {
      const applicationId = parseInt(req.params.applicationId);
      const data = await confirmationRepo.getConfirmationDetail(applicationId);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Data pendaftar tidak ditemukan.' });
      }

      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      if (!isSuperAdmin && !req.user.institutions.includes(data.targetInstitutionId)) {
        return res.status(403).json({ success: false, message: 'Akses ditolak ke lembaga ini.' });
      }

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async startConfirmation(req, res, next) {
    try {
      const { application_id, confirmation_track_id } = req.body;
      if (!application_id || !confirmation_track_id) {
        return res.status(422).json({ success: false, message: 'Pendaftar dan jalur konfirmasi wajib dipilih.' });
      }

      const detail = await confirmationRepo.getConfirmationDetail(Number(application_id));
      if (!detail) {
        return res.status(404).json({ success: false, message: 'Pendaftar tidak ditemukan.' });
      }

      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      if (!isSuperAdmin && !req.user.institutions.includes(detail.targetInstitutionId)) {
        return res.status(403).json({ success: false, message: 'Akses ditolak ke lembaga ini.' });
      }

      const confirmationId = await confirmationService.startConfirmation(
        Number(application_id),
        Number(confirmation_track_id),
        req.user.id
      );

      res.status(201).json({
        success: true,
        message: 'Proses konfirmasi berhasil dimulai.',
        data: { confirmationId }
      });
    } catch (err) {
      next(err);
    }
  }

  async verifyDocument(req, res, next) {
    try {
      const confirmationId = parseInt(req.params.confirmationId);
      const { document_type_id, status, notes } = req.body;

      if (!document_type_id || !status) {
        return res.status(422).json({ success: false, message: 'Jenis dokumen dan status verifikasi wajib dikirim.' });
      }

      await confirmationService.verifyDocument(
        confirmationId,
        Number(document_type_id),
        status,
        notes,
        req.user.id
      );

      res.json({ success: true, message: 'Status verifikasi dokumen berhasil diperbarui.' });
    } catch (err) {
      next(err);
    }
  }

  async addPayment(req, res, next) {
    try {
      const confirmationId = parseInt(req.params.confirmationId);
      const { amount, payment_date, payment_method } = req.body;

      let proofFilePath = null;
      if (req.file) {
        proofFilePath = req.file.path.replace(/\\/g, '/');
      }

      const paymentNumber = await confirmationService.addPayment(
        confirmationId,
        {
          amount,
          payment_date,
          payment_method,
          proof_file_path: proofFilePath
        },
        req.user.id
      );

      res.status(201).json({
        success: true,
        message: 'Pembayaran berhasil dicatat.',
        data: { paymentNumber }
      });
    } catch (err) {
      next(err);
    }
  }

  async verifyPayment(req, res, next) {
    try {
      const paymentId = parseInt(req.params.paymentId);
      const { status, notes } = req.body;

      if (!status) {
        return res.status(422).json({ success: false, message: 'Status verifikasi pembayaran wajib dipilih.' });
      }

      const result = await confirmationService.verifyPayment(
        paymentId,
        status,
        notes,
        req.user.id
      );

      res.json({
        success: true,
        message: 'Verifikasi pembayaran berhasil diperbarui.',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async finalizeAdmission(req, res, next) {
    try {
      const confirmationId = parseInt(req.params.confirmationId);
      const { official_student_number, notes } = req.body;

      const studentNumber = await confirmationService.finalizeAdmission(
        confirmationId,
        official_student_number,
        notes,
        req.user.id
      );

      res.json({
        success: true,
        message: 'Pendaftar resmi DITERIMA sebagai siswa/santri baru.',
        data: { officialStudentNumber: studentNumber }
      });
    } catch (err) {
      next(err);
    }
  }

  async cancelAdmission(req, res, next) {
    try {
      const confirmationId = parseInt(req.params.confirmationId);
      const { reason } = req.body;

      await confirmationService.cancelAdmission(confirmationId, reason, req.user.id);
      res.json({ success: true, message: 'Penetapan penerimaan berhasil dibatalkan.' });
    } catch (err) {
      next(err);
    }
  }

  // --- OFFICIAL STUDENTS LIST ---
  async getOfficialStudents(req, res, next) {
    try {
      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      let targetInstitutionId = req.query.institution_id ? parseInt(req.query.institution_id) : null;

      if (!isSuperAdmin) {
        if (targetInstitutionId && !req.user.institutions.includes(targetInstitutionId)) {
          return res.status(403).json({ success: false, message: 'Akses ditolak ke lembaga ini.' });
        }
        if (!targetInstitutionId && req.user.institutions.length > 0) {
          targetInstitutionId = req.user.institutions[0];
        }
      }

      const options = {
        institutionId: targetInstitutionId,
        confirmationTrackId: req.query.confirmation_track_id ? parseInt(req.query.confirmation_track_id) : null,
        academicYear: req.query.academic_year || null,
        search: req.query.q || '',
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20
      };

      const result = await confirmationRepo.getOfficialStudents(options);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ConfirmationController();
