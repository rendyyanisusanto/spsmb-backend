const pool = require('../config/database');
const crypto = require('crypto');
const applicantRepo = require('../repositories/applicantRepository');
const guardianRepo = require('../repositories/guardianRepository');
const applicationRepo = require('../repositories/applicationRepository');
const pondokResolver = require('./pondokResolverService');
const continueTokenService = require('./continueTokenService');
const registrationNumberService = require('./registrationNumberService');
const { normalizeWhatsApp } = require('../utils/whatsappFormatter');

class PublicApplicationService {
  async createInitialApplication(data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Validasi Institusi jika tipe pendaftaran formal
      if (['SMP', 'SMA', 'SMK'].includes(data.registrationType)) {
        const [institutions] = await connection.query(
          `SELECT * FROM institutions WHERE id = ? AND institution_type = ? AND is_active = 1`,
          [data.formalInstitutionId, data.registrationType]
        );
        if (institutions.length === 0) {
          const error = new Error('Lembaga pendidikan formal tidak valid atau tidak aktif.');
          error.status = 422;
          throw error;
        }
      }

      // 2. Resolve Pondok
      const pondokId = await pondokResolver.resolvePondokInstitution(data.gender);

      // 3. Insert Applicant
      const applicantId = await applicantRepo.create({
        full_name: data.fullName,
        gender: data.gender,
        whatsapp: normalizeWhatsApp(data.whatsapp),
        address: data.address,
        previous_school: data.previousSchool,
        information_source_id: data.informationSourceId,
        information_source_other: data.informationSourceOther,
        birth_place: data.birthPlace,
        birth_date: data.birthDate
      }, connection);

      // 4. Insert Guardian
      await guardianRepo.create({
        applicant_id: applicantId,
        relationship: 'GUARDIAN',
        name: data.parentName
      }, connection);

      // 5. Generate Continue Token
      const rawContinueToken = continueTokenService.generateToken();
      const continueTokenHash = continueTokenService.hashToken(rawContinueToken);
      const continueTokenExpiresAt = continueTokenService.getExpirationDate();

      // 6. Get Current Period & Wave
      const [periods] = await connection.query('SELECT p.*, a.name as academic_year_name FROM admission_periods p LEFT JOIN academic_years a ON p.academic_year = a.id WHERE p.is_active = 1 LIMIT 1');
      if (periods.length === 0) {
        const error = new Error('Pendaftaran SPSMB saat ini ditutup.');
        error.status = 403;
        throw error;
      }
      const period = periods[0];

      const nowStr = new Date().toISOString().split('T')[0];
      const [waves] = await connection.query('SELECT * FROM admission_waves WHERE admission_period_id = ? AND is_active = 1 AND start_date <= ? AND end_date >= ? LIMIT 1', [period.id, nowStr, nowStr]);
      if (waves.length === 0) {
        const error = new Error('Pendaftaran SPSMB saat ini ditutup.');
        error.status = 403;
        throw error;
      }
      const wave = waves[0];

      // 7. Insert Application (with temp registration number)
      const tempRegistrationNumber = `TMP-${crypto.randomUUID()}`;
      const applicationId = await applicationRepo.create({
        registration_number: tempRegistrationNumber,
        applicant_id: applicantId,
        admission_period_id: period.id,
        admission_wave_id: wave.id,
        registration_type: data.registrationType,
        formal_institution_id: data.registrationType === 'NON_FORMAL' ? null : data.formalInstitutionId,
        pondok_institution_id: pondokId,
        status: 'DRAFT',
        step_completed: 1,
        continue_token_hash: continueTokenHash,
        continue_token_expires_at: continueTokenExpiresAt
      }, connection);

      // 8. Generate and Update Final Registration Number
      const finalRegistrationNumber = await registrationNumberService.generateFinalNumber(applicationId, period.academic_year_name);
      await applicationRepo.updateRegistrationNumber(applicationId, finalRegistrationNumber, connection);

      await connection.commit();
      
      return {
        registrationNumber: finalRegistrationNumber,
        continueToken: rawContinueToken,
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getReceipt(registrationNumber, rawToken) {
    const application = await applicationRepo.getReceiptByRegistrationNumber(registrationNumber);
    
    if (!application) {
      const error = new Error('Data pendaftaran tidak ditemukan.');
      error.status = 404;
      throw error;
    }

    const tokenHash = continueTokenService.hashToken(rawToken);
    if (application.continue_token_hash !== tokenHash) {
      const error = new Error('Token tidak valid atau tidak cocok.');
      error.status = 401;
      throw error;
    }

    if (new Date(application.continue_token_expires_at) < new Date()) {
      const error = new Error('Link untuk melanjutkan pendaftaran telah kedaluwarsa.');
      error.status = 401;
      throw error;
    }

    return {
      registrationNumber: application.registration_number,
      studentName: application.full_name,
      gender: application.gender,
      whatsapp: application.whatsapp,
      address: application.address,
      parentName: application.parent_name,
      previousSchool: application.previous_school,
      registrationType: application.registration_type,
      institution: application.formal_institution_id ? {
        id: application.formal_institution_id,
        name: application.formal_institution_name
      } : null,
      pondok: {
        id: application.pondok_institution_id,
        name: application.pondok_institution_name
      },
      period: {
        id: application.period_id,
        name: application.period_name
      },
      wave: {
        id: application.wave_id,
        name: application.wave_name
      },
      status: application.status,
      createdAt: application.created_at
    };
  }
}

module.exports = new PublicApplicationService();
