const pool = require('../config/database');
const confirmationRepo = require('../repositories/confirmationRepository');
const auditService = require('./auditService');
const publicDocService = require('./publicDocumentService');

class ConfirmationService {
  async startConfirmation(applicationId, trackId, userId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Get Application
      const [appRows] = await connection.query(`
        SELECT a.*, p.academic_year as period_academic_year
        FROM applications a
        LEFT JOIN admission_periods p ON a.admission_period_id = p.id
        WHERE a.id = ? FOR UPDATE
      `, [applicationId]);

      if (appRows.length === 0) {
        throw { status: 404, message: 'Pendaftar tidak ditemukan.' };
      }
      const application = appRows[0];

      if (application.status !== 'SUBMITTED') {
        throw { status: 422, message: 'Hanya pendaftar dengan status pendaftaran SUBMITTED yang dapat diproses konfirmasi.' };
      }

      // 2. Prevent duplicate confirmation
      const [existingConf] = await connection.query(`
        SELECT id, status FROM application_confirmations WHERE application_id = ?
      `, [applicationId]);
      if (existingConf.length > 0) {
        throw { status: 422, message: 'Pendaftar sudah masuk dalam proses konfirmasi sebelumnya.' };
      }

      // 3. Validate track
      const targetInstitutionId = application.formal_institution_id || application.pondok_institution_id;
      const [trackRows] = await connection.query(`
        SELECT * FROM confirmation_tracks WHERE id = ? AND institution_id = ? AND is_active = 1
      `, [trackId, targetInstitutionId]);

      if (trackRows.length === 0) {
        throw { status: 422, message: 'Jalur konfirmasi tidak valid untuk lembaga pendaftar ini.' };
      }
      const track = trackRows[0];

      // 4. Create confirmation record
      const [confResult] = await connection.query(`
        INSERT INTO application_confirmations (
          application_id, institution_id, confirmation_track_id, academic_year,
          status, document_verification_status, payment_status,
          total_bill_amount, total_paid_amount, created_by
        ) VALUES (?, ?, ?, ?, 'PROSES', 'BELUM_LENGKAP', 'BELUM_BAYAR', 0.00, 0.00, ?)
      `, [
        applicationId,
        targetInstitutionId,
        track.id,
        track.academic_year || application.period_academic_year || '2027/2028',
        userId
      ]);
      const confirmationId = confResult.insertId;

      // 5. Generate bill items snapshot from active fee components
      const [feeComponents] = await connection.query(`
        SELECT * FROM confirmation_fee_components
        WHERE institution_id = ? AND is_active = 1
          AND (confirmation_track_id = ? OR confirmation_track_id IS NULL)
        ORDER BY order_index ASC, id ASC
      `, [targetInstitutionId, track.id]);

      let totalBill = 0;
      for (const comp of feeComponents) {
        await connection.query(`
          INSERT INTO confirmation_bill_items (confirmation_id, fee_component_id, name, amount, is_required)
          VALUES (?, ?, ?, ?, ?)
        `, [
          confirmationId,
          comp.id,
          comp.name,
          comp.amount,
          comp.is_required
        ]);
        if (comp.is_required) {
          totalBill += Number(comp.amount);
        }
      }

      // Update total_bill_amount on confirmation
      await connection.query(`
        UPDATE application_confirmations SET total_bill_amount = ? WHERE id = ?
      `, [totalBill, confirmationId]);

      // 6. Initialize Document Checklist based on requirements & existing uploaded documents
      const effectiveReqs = await publicDocService.getEffectiveRequirements(application);
      const [uploadedDocs] = await connection.query(`
        SELECT * FROM applicant_documents WHERE application_id = ?
      `, [applicationId]);

      let allDocsVerified = effectiveReqs.length > 0;
      let hasUploadedDocs = false;

      for (const req of effectiveReqs) {
        const foundUploaded = uploadedDocs.find(d => d.document_type_id === req.documentTypeId);
        const docStatus = foundUploaded ? 'MENUNGGU_VERIFIKASI' : 'BELUM_UNGGAH';
        if (foundUploaded) hasUploadedDocs = true;
        allDocsVerified = false; // Initially needs explicit verification

        await connection.query(`
          INSERT INTO confirmation_document_verifications (
            confirmation_id, document_type_id, applicant_document_id, status
          ) VALUES (?, ?, ?, ?)
        `, [
          confirmationId,
          req.documentTypeId,
          foundUploaded ? foundUploaded.id : null,
          docStatus
        ]);
      }

      const initialDocStatus = hasUploadedDocs ? 'MENUNGGU_VERIFIKASI' : 'BELUM_LENGKAP';
      await connection.query(`
        UPDATE application_confirmations SET document_verification_status = ? WHERE id = ?
      `, [initialDocStatus, confirmationId]);

      await connection.commit();
      return confirmationId;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async verifyDocument(confirmationId, documentTypeId, status, notes, userId) {
    if (!['TERVERIFIKASI', 'DITOLAK'].includes(status)) {
      throw { status: 422, message: 'Status verifikasi dokumen tidak valid.' };
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(`
        UPDATE confirmation_document_verifications
        SET status = ?, notes = ?, verified_by = ?, verified_at = NOW()
        WHERE confirmation_id = ? AND document_type_id = ?
      `, [status, notes || null, userId, confirmationId, documentTypeId]);

      // Check overall document status
      const [allDocs] = await connection.query(`
        SELECT cdv.status, dr.is_required
        FROM confirmation_document_verifications cdv
        JOIN application_confirmations ac ON cdv.confirmation_id = ac.id
        LEFT JOIN form_targets ft ON (ft.institution_id = ac.institution_id OR ft.target_type = 'COMMON')
        LEFT JOIN document_requirements dr ON (dr.document_type_id = cdv.document_type_id AND dr.form_target_id = ft.id)
        WHERE cdv.confirmation_id = ?
      `, [confirmationId]);

      let hasRejected = false;
      let hasPending = false;
      let allRequiredVerified = true;

      for (const d of allDocs) {
        if (d.status === 'DITOLAK') hasRejected = true;
        if (d.status === 'MENUNGGU_VERIFIKASI' || d.status === 'BELUM_UNGGAH') {
          hasPending = true;
          allRequiredVerified = false;
        }
      }

      let overallDocStatus = 'BELUM_LENGKAP';
      if (allRequiredVerified && !hasRejected && !hasPending) {
        overallDocStatus = 'TERVERIFIKASI';
      } else if (hasRejected) {
        overallDocStatus = 'DITOLAK';
      } else if (hasPending) {
        overallDocStatus = 'MENUNGGU_VERIFIKASI';
      }

      await connection.query(`
        UPDATE application_confirmations SET document_verification_status = ? WHERE id = ?
      `, [overallDocStatus, confirmationId]);

      await connection.commit();
      return true;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async addPayment(confirmationId, paymentData, userId) {
    const amount = Number(paymentData.amount);
    if (!amount || amount <= 0) {
      throw { status: 422, message: 'Nominal pembayaran harus lebih besar dari 0.' };
    }
    if (!paymentData.payment_date) {
      throw { status: 422, message: 'Tanggal pembayaran wajib diisi.' };
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const paymentNumber = `PAY-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;

      await connection.query(`
        INSERT INTO confirmation_payments (
          confirmation_id, payment_number, amount, payment_date, payment_method,
          proof_file_path, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
      `, [
        confirmationId,
        paymentNumber,
        amount,
        paymentData.payment_date,
        paymentData.payment_method || 'TRANSFER',
        paymentData.proof_file_path || null,
        userId
      ]);

      await connection.commit();
      return paymentNumber;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async verifyPayment(paymentId, status, notes, userId) {
    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      throw { status: 422, message: 'Status verifikasi pembayaran tidak valid.' };
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [payRows] = await connection.query(`
        SELECT * FROM confirmation_payments WHERE id = ? FOR UPDATE
      `, [paymentId]);
      if (payRows.length === 0) {
        throw { status: 404, message: 'Data pembayaran tidak ditemukan.' };
      }
      const payment = payRows[0];
      const confirmationId = payment.confirmation_id;

      await connection.query(`
        UPDATE confirmation_payments
        SET status = ?, verification_notes = ?, verified_by = ?, verified_at = NOW()
        WHERE id = ?
      `, [status, notes || null, userId, paymentId]);

      // Recalculate total verified paid amount
      const [sumRows] = await connection.query(`
        SELECT COALESCE(SUM(amount), 0) as total_verified
        FROM confirmation_payments
        WHERE confirmation_id = ? AND status = 'VERIFIED'
      `, [confirmationId]);
      const totalPaid = Number(sumRows[0].total_verified);

      // Get total required bill
      const [billRows] = await connection.query(`
        SELECT total_bill_amount FROM application_confirmations WHERE id = ?
      `, [confirmationId]);
      const totalBill = Number(billRows[0]?.total_bill_amount || 0);

      let payStatus = 'BELUM_BAYAR';
      if (totalPaid >= totalBill && totalBill > 0) {
        payStatus = 'LUNAS';
      } else if (totalPaid > 0) {
        payStatus = 'SEBAGIAN';
      } else if (totalBill === 0) {
        payStatus = 'LUNAS';
      }

      await connection.query(`
        UPDATE application_confirmations
        SET total_paid_amount = ?, payment_status = ?
        WHERE id = ?
      `, [totalPaid, payStatus, confirmationId]);

      await connection.commit();
      return { totalPaid, payStatus };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async finalizeAdmission(confirmationId, officialNumber, notes, userId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [confRows] = await connection.query(`
        SELECT ac.*, a.registration_number, i.code as inst_code
        FROM application_confirmations ac
        JOIN applications a ON ac.application_id = a.id
        JOIN institutions i ON ac.institution_id = i.id
        WHERE ac.id = ? FOR UPDATE
      `, [confirmationId]);

      if (confRows.length === 0) {
        throw { status: 404, message: 'Data konfirmasi tidak ditemukan.' };
      }
      const conf = confRows[0];

      if (conf.status === 'DITERIMA') {
        throw { status: 422, message: 'Pendaftar ini sudah berstatus resmi DITERIMA.' };
      }

      // Check document verification
      if (conf.document_verification_status !== 'TERVERIFIKASI') {
        throw { status: 422, message: 'Seluruh dokumen wajib pendaftar harus berstatus TERVERIFIKASI sebelum dapat ditetapkan resmi diterima.' };
      }

      // Check payment status
      if (conf.total_bill_amount > 0 && conf.payment_status !== 'LUNAS') {
        throw { status: 422, message: 'Tagihan wajib pendaftar belum LUNAS. Mohon periksa dan verifikasi pembayaran terlebih dahulu.' };
      }

      // Generate official number if empty
      const yearStr = new Date().getFullYear().toString();
      const studentNumber = officialNumber?.trim() || `${conf.inst_code}-${yearStr}-${conf.registration_number.slice(-5)}`;

      await connection.query(`
        UPDATE application_confirmations
        SET status = 'DITERIMA',
            official_student_number = ?,
            decision_date = NOW(),
            decided_by = ?,
            notes = ?
        WHERE id = ?
      `, [studentNumber, userId, notes || null, confirmationId]);

      await connection.commit();
      return studentNumber;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async cancelAdmission(confirmationId, reason, userId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(`
        UPDATE application_confirmations
        SET status = 'BATAL', notes = CONCAT(COALESCE(notes, ''), '\n[Dibatalkan]: ', ?)
        WHERE id = ?
      `, [reason || 'Dibatalkan oleh admin', confirmationId]);

      await connection.commit();
      return true;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

module.exports = new ConfirmationService();
