const applicationRepository = require('../repositories/applicationRepository');
const auditLogRepository = require('../repositories/auditLogRepository');

class ApplicationService {
  _getInstitutionScope(user) {
    if (!user || user.primaryRole === 'SUPER_ADMIN') {
      return null;
    }
    
    // If not SUPER_ADMIN, user must have institutions assigned
    return user.institutions ? user.institutions.map(i => i.id || i) : [];
  }

  _checkScope(application, scope) {
    if (scope === null) return true; // SUPER_ADMIN
    
    if (scope.length === 0) return false;

    return scope.includes(application.formal_institution_id) || 
           scope.includes(application.pondok_institution_id);
  }

  async getApplications(params, user) {
    const scope = this._getInstitutionScope(user);
    if (scope !== null) {
      if (scope.length === 0) {
        return {
          data: [],
          meta: {
            page: Number(params.page) || 1,
            limit: Number(params.limit) || 20,
            total: 0,
            totalPages: 0
          }
        };
      }
      params.institutionScope = scope;
    }

    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, 100);
    params.page = page;
    params.limit = limit;

    const applications = await applicationRepository.findApplications(params);
    const total = await applicationRepository.countApplications(params);

    const formattedApplications = applications.map(app => ({
      id: app.id,
      registrationNumber: app.registrationNumber,
      applicant: {
        id: app.applicantId,
        fullName: app.applicantFullName,
        gender: app.applicantGender,
        whatsapp: app.applicantWhatsapp
      },
      registrationType: app.registrationType,
      formalInstitution: app.formalInstitutionId ? {
        id: app.formalInstitutionId,
        code: app.formalInstitutionCode,
        name: app.formalInstitutionName
      } : null,
      pondokInstitution: app.pondokInstitutionId ? {
        id: app.pondokInstitutionId,
        code: app.pondokInstitutionCode,
        name: app.pondokInstitutionName
      } : null,
      period: app.periodId ? {
        id: app.periodId,
        academicYear: app.periodAcademicYear
      } : null,
      wave: app.waveId ? {
        id: app.waveId,
        name: app.waveName
      } : null,
      status: app.status,
      stepCompleted: app.stepCompleted,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      submittedAt: app.submittedAt
    }));

    return {
      data: formattedApplications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async exportApplications(params, user) {
    const scope = this._getInstitutionScope(user);
    if (scope !== null) {
      if (scope.length === 0) return [];
      params.institutionScope = scope;
    }

    // Force fetch all without pagination
    params.page = 1;
    params.limit = 10000;

    const applications = await applicationRepository.findApplications(params);
    if (applications.length === 0) return [];

    const appIds = applications.map(a => a.id);
    const dynamicAnswers = await applicationRepository.findDynamicAnswersByApplicationIds(appIds);

    // Group answers by application_id
    const answersByAppId = {};
    dynamicAnswers.forEach(ans => {
      if (!answersByAppId[ans.application_id]) {
        answersByAppId[ans.application_id] = {};
      }
      
      let parsedAnswer = ans.answer_value;
      if (ans.input_type === 'CHECKBOX' || ans.input_type === 'FILE' || (typeof parsedAnswer === 'string' && parsedAnswer.startsWith('['))) {
        try { parsedAnswer = JSON.parse(parsedAnswer); } catch (e) {}
      }
      
      if (ans.input_type === 'CHECKBOX' && Array.isArray(parsedAnswer)) {
        parsedAnswer = parsedAnswer.join(', ');
      } else if (ans.input_type === 'FILE') {
        parsedAnswer = parsedAnswer ? 'Terlampir' : '';
      }
      
      answersByAppId[ans.application_id][ans.label] = parsedAnswer;
    });

    return applications.map(app => {
      const baseData = {
        'No. Registrasi': app.registrationNumber,
        'Tanggal Daftar': app.createdAt,
        'Nama Lengkap': app.applicantFullName,
        'Jenis Kelamin': app.applicantGender === 'MALE' ? 'Laki-laki' : (app.applicantGender === 'FEMALE' ? 'Perempuan' : ''),
        'Nomor HP/WhatsApp': app.applicantWhatsapp,
        'Lembaga Formal': app.formalInstitutionName || '',
        'Lembaga Pondok': app.pondokInstitutionName || '',
        'Status': app.status
      };
      
      const appDynamic = answersByAppId[app.id] || {};
      
      return { ...baseData, ...appDynamic };
    });
  }

  async getApplicationDetail(identifier, user, isRegistrationNumber = false) {
    let application;
    
    if (isRegistrationNumber) {
      application = await applicationRepository.findApplicationByRegistrationNumber(identifier);
    } else {
      application = await applicationRepository.findApplicationById(identifier);
    }

    if (!application) {
      const error = new Error('Application not found');
      error.statusCode = 404;
      throw error;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(application, scope)) {
      const error = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }

    const applicant = await applicationRepository.findApplicantByApplicationId(application.id);
    const rawGuardians = await applicationRepository.findGuardiansByApplicantId(applicant.id);
    const majorChoices = await applicationRepository.findMajorChoicesByApplicationId(application.id);
    let dynamicAnswers = await applicationRepository.findDynamicAnswersByApplicationId(application.id);
    const documents = await applicationRepository.findDocumentsByApplicationId(application.id);
    const statusHistory = await auditLogRepository.findByEntity('APPLICATION', application.id, 'STATUS_CHANGE');

    const guardians = {
      father: rawGuardians.find(g => g.relationship === 'FATHER') || null,
      mother: rawGuardians.find(g => g.relationship === 'MOTHER') || null,
      guardian: rawGuardians.find(g => g.relationship === 'GUARDIAN') || null
    };

    // Parse JSON options if they exist
    dynamicAnswers = dynamicAnswers.map(ans => {
      let parsedAnswer = ans.answer_value;
      if (ans.input_type === 'CHECKBOX' || ans.input_type === 'FILE' || (typeof parsedAnswer === 'string' && parsedAnswer.startsWith('['))) {
        try {
          parsedAnswer = JSON.parse(parsedAnswer);
        } catch (e) {
          // Keep raw value if not valid JSON
        }
      }

      return {
        fieldId: ans.form_field_id,
        fieldCode: ans.field_code,
        label: ans.label,
        inputType: ans.input_type,
        section: {
          id: ans.section_id,
          code: ans.section_code,
          name: ans.section_name
        },
        target: {
          id: ans.target_id,
          code: ans.target_code,
          targetType: ans.target_type
        },
        answer: parsedAnswer
      };
    });

    const formattedDocuments = documents.map(doc => ({
      documentTypeId: doc.document_type_id,
      code: doc.document_code,
      name: doc.document_name,
      fileName: doc.file_name,
      filePath: doc.file_path,
      fileSize: doc.file_size,
      mimeType: doc.mime_type,
      uploadedAt: doc.uploaded_at
    }));

    const formattedHistory = statusHistory.map(hist => {
      // Parse description assuming format "STATUS_CHANGE: DRAFT -> SUBMITTED" or similar
      let fromStatus = null;
      let toStatus = null;
      
      const match = hist.description.match(/([A-Z_]+)\s*(?:->|menjadi)\s*([A-Z_]+)/i);
      if (match) {
        fromStatus = match[1].toUpperCase();
        toStatus = match[2].toUpperCase();
      }

      return {
        id: hist.id,
        fromStatus,
        toStatus,
        description: hist.description,
        changedBy: {
          id: hist.user_id,
          name: hist.user_name
        },
        createdAt: hist.createdAt
      };
    });

    return {
      application: {
        id: application.id,
        registrationNumber: application.registration_number,
        status: application.status,
        stepCompleted: application.step_completed,
        registrationType: application.registration_type,
        createdAt: application.created_at,
        updatedAt: application.updated_at,
        submittedAt: application.submitted_at
      },
      registration: {
        period: application.period_id ? {
          id: application.period_id,
          academicYear: application.period_academic_year,
          startDate: application.period_start_date,
          endDate: application.period_end_date,
          isActive: application.period_is_active
        } : null,
        wave: application.wave_id ? {
          id: application.wave_id,
          name: application.wave_name,
          startDate: application.wave_start_date,
          endDate: application.wave_end_date,
          isActive: application.wave_is_active
        } : null,
        formalInstitution: application.formal_institution_id ? {
          id: application.formal_institution_id,
          code: application.formal_institution_code,
          name: application.formal_institution_name
        } : null,
        pondokInstitution: application.pondok_institution_id ? {
          id: application.pondok_institution_id,
          code: application.pondok_institution_code,
          name: application.pondok_institution_name
        } : null
      },
      applicant: {
        id: applicant.id,
        fullName: applicant.full_name,
        gender: applicant.gender,
        whatsapp: applicant.whatsapp,
        address: applicant.address,
        previousSchool: applicant.previous_school,
        nik: applicant.nik,
        nisn: applicant.nisn,
        birthPlace: applicant.birth_place,
        birthDate: applicant.birth_date,
        informationSource: applicant.information_source_id ? {
          id: applicant.information_source_id,
          name: applicant.information_source_name
        } : null,
        informationSourceOther: applicant.information_source_other,
        createdAt: applicant.created_at,
        updatedAt: applicant.updated_at
      },
      guardians,
      majors: majorChoices,
      dynamicAnswers,
      documents: formattedDocuments,
      statusHistory: formattedHistory
    };
  }

  async getStatusHistory(id, user) {
    const application = await applicationRepository.findApplicationById(id);
    if (!application) {
      const error = new Error('Application not found');
      error.statusCode = 404;
      throw error;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(application, scope)) {
      const error = new Error('Forbidden');
      error.statusCode = 403;
      throw error;
    }

    const history = await auditLogRepository.findByEntity('APPLICATION', application.id, 'STATUS_CHANGE');
    
    return history.map(hist => {
      let fromStatus = null;
      let toStatus = null;
      
      const match = hist.description.match(/([A-Z_]+)\s*(?:->|menjadi)\s*([A-Z_]+)/i);
      if (match) {
        fromStatus = match[1].toUpperCase();
        toStatus = match[2].toUpperCase();
      }

      return {
        id: hist.id,
        fromStatus,
        toStatus,
        description: hist.description,
        changedBy: {
          id: hist.user_id,
          name: hist.user_name
        },
        createdAt: hist.createdAt
      };
    });
  }
}

module.exports = new ApplicationService();
