const pool = require('../config/database');
const repo = require('../repositories/applicantDocumentRepository');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PublicDocumentService {
  async getEffectiveRequirements(application) {
    const targets = [];
    targets.push({ type: 'COMMON', institutionId: null });
    targets.push({ type: 'PONDOK_COMMON', institutionId: null });

    if (application.pondok_institution_id) {
      targets.push({ type: 'INSTITUTION', institutionId: application.pondok_institution_id });
    }

    if (['SMP', 'SMA', 'SMK'].includes(application.registration_type) && application.formal_institution_id) {
      targets.push({ type: 'INSTITUTION', institutionId: application.formal_institution_id });
    }

    const targetConditions = targets.map(t => {
      if (t.institutionId) {
        return `(t.target_type = '${t.type}' AND t.institution_id = ${t.institutionId})`;
      } else {
        return `(t.target_type = '${t.type}' AND t.institution_id IS NULL)`;
      }
    }).join(' OR ');

    const query = `
      SELECT r.*, t.target_type, t.institution_id,
             d.code as doc_code, d.name as doc_name, d.description, d.allowed_extensions, d.max_size_mb
      FROM document_requirements r
      JOIN form_targets t ON r.form_target_id = t.id
      JOIN document_types d ON r.document_type_id = d.id
      WHERE t.is_active = 1 AND d.is_active = 1 AND (${targetConditions})
    `;
    
    const [reqs] = await pool.query(query);

    const map = new Map();
    const specificity = { 'INSTITUTION': 3, 'PONDOK_COMMON': 2, 'COMMON': 1 };

    for (const r of reqs) {
      const docId = r.document_type_id;
      if (!map.has(docId)) {
        map.set(docId, {
          documentTypeId: docId,
          code: r.doc_code,
          name: r.doc_name,
          description: r.description,
          required: !!r.is_required,
          sortOrder: r.sort_order,
          allowedExtensions: r.allowed_extensions ? r.allowed_extensions.split(',').map(s => s.trim().toLowerCase()) : [],
          maxSizeMb: r.max_size_mb,
          _targetType: r.target_type
        });
      } else {
        const existing = map.get(docId);
        if (r.is_required) existing.required = true;
        if (specificity[r.target_type] > specificity[existing._targetType]) {
          existing._targetType = r.target_type;
          existing.sortOrder = r.sort_order;
        }
      }
    }

    const requirements = Array.from(map.values());
    requirements.sort((a, b) => {
      const specA = specificity[a._targetType];
      const specB = specificity[b._targetType];
      if (specA !== specB) return specB - specA;
      return a.sortOrder - b.sortOrder;
    });

    requirements.forEach(r => delete r._targetType);
    return requirements;
  }

  async getDocuments(application) {
    const requirements = await this.getEffectiveRequirements(application);
    const existingDocs = await repo.findByApplicationId(application.id);

    let requiredTotal = 0;
    let requiredUploaded = 0;

    const documents = requirements.map(req => {
      if (req.required) requiredTotal++;
      
      const existing = existingDocs.find(d => d.document_type_id === req.documentTypeId);
      if (existing) {
        if (req.required) requiredUploaded++;
        return {
          ...req,
          uploadStatus: 'UPLOADED',
          file: {
            fileName: existing.file_name,
            fileSize: existing.file_size,
            mimeType: existing.mime_type,
            uploadedAt: existing.uploaded_at
          }
        };
      } else {
        return {
          ...req,
          uploadStatus: 'NOT_UPLOADED',
          file: null
        };
      }
    });

    const missingRequired = requiredTotal - requiredUploaded;
    const complete = missingRequired === 0;

    return {
      documents,
      summary: {
        total: requirements.length,
        required: requiredTotal,
        uploaded: existingDocs.length,
        missingRequired,
        complete
      }
    };
  }

  getStoragePath() {
    return path.join(process.cwd(), 'storage', 'applicant-documents');
  }

  async uploadDocument(application, documentTypeId, file) {
    const settings = await require('./settingService').getSettings();
    if (application.status !== 'DRAFT' && !settings.registration.allowEditAfterSubmit) {
      throw { status: 409, message: 'Pendaftaran sudah dikirim dan tidak dapat diubah.' };
    }

    const requirements = await this.getEffectiveRequirements(application);
    const req = requirements.find(r => r.documentTypeId === parseInt(documentTypeId));
    if (!req) {
      throw { status: 422, message: 'Tipe dokumen tidak diperlukan untuk pendaftaran ini' };
    }

    const extension = path.extname(file.originalname).substring(1).toLowerCase();
    if (!req.allowedExtensions.includes(extension)) {
      throw { status: 422, message: `Ekstensi file .${extension} tidak diizinkan` };
    }

    const maxSize = req.maxSizeMb * 1024 * 1024;
    if (file.size > maxSize) {
      throw { status: 422, message: `Ukuran file maksimal ${req.maxSizeMb} MB` };
    }

    const storageBase = this.getStoragePath();
    const appDir = path.join(storageBase, application.id.toString(), documentTypeId.toString());
    
    fs.mkdirSync(appDir, { recursive: true });

    const physicalFileName = crypto.randomUUID() + '.' + extension;
    const filePath = path.join(appDir, physicalFileName);

    // Save physical file
    fs.renameSync(file.path, filePath);

    const relativePath = path.join('storage', 'applicant-documents', application.id.toString(), documentTypeId.toString(), physicalFileName).replace(/\\/g, '/');

    const documentData = {
      application_id: application.id,
      document_type_id: documentTypeId,
      file_name: file.originalname,
      file_path: relativePath,
      file_size: file.size,
      mime_type: file.mimetype,
      uploaded_at: new Date()
    };

    const existing = await repo.findByApplicationAndDocType(application.id, documentTypeId);
    
    if (existing) {
      // Begin transaction to update safely
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        
        await connection.query('UPDATE applicant_documents SET file_name = ?, file_path = ?, file_size = ?, mime_type = ?, uploaded_at = ? WHERE id = ?', [
          documentData.file_name, documentData.file_path, documentData.file_size, documentData.mime_type, documentData.uploaded_at, existing.id
        ]);
        
        await connection.commit();
        
        // delete old file
        const oldPhysicalPath = path.join(process.cwd(), existing.file_path);
        if (fs.existsSync(oldPhysicalPath)) {
          fs.unlinkSync(oldPhysicalPath);
        }
      } catch (err) {
        await connection.rollback();
        // remove newly uploaded file on failure
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        throw err;
      } finally {
        connection.release();
      }
    } else {
      await repo.create(documentData);
    }
    
    // Check if step is complete and update applications step_completed
    const currentStatus = await this.getDocuments(application);
    if (currentStatus.summary.complete) {
      // Find total effective sections
      const [sections] = await pool.query('SELECT COUNT(*) as total FROM form_sections WHERE is_active = 1');
      // Step_completed should be total sections + 1 (the document step itself is the last)
      const docStepNumber = sections[0].total + 1;
      await pool.query('UPDATE applications SET step_completed = ? WHERE id = ? AND step_completed < ?', [docStepNumber, application.id, docStepNumber]);
    }

    return { success: true };
  }

  async deleteDocument(application, documentTypeId) {
    const settings = await require('./settingService').getSettings();
    if (application.status !== 'DRAFT' && !settings.registration.allowEditAfterSubmit) {
      throw { status: 409, message: 'Pendaftaran sudah dikirim dan tidak dapat diubah.' };
    }

    const existing = await repo.findByApplicationAndDocType(application.id, documentTypeId);
    if (!existing) {
      throw { status: 404, message: 'Dokumen tidak ditemukan' };
    }

    await repo.remove(existing.id);

    const physicalPath = path.join(process.cwd(), existing.file_path);
    if (fs.existsSync(physicalPath)) {
      fs.unlinkSync(physicalPath);
    }

    return { success: true };
  }

  async viewDocument(application, documentTypeId, res) {
    const existing = await repo.findByApplicationAndDocType(application.id, documentTypeId);
    if (!existing) {
      throw { status: 404, message: 'Dokumen tidak ditemukan' };
    }

    const physicalPath = path.join(process.cwd(), existing.file_path);
    if (!fs.existsSync(physicalPath)) {
      throw { status: 404, message: 'File tidak ditemukan di server' };
    }

    res.setHeader('Content-Type', existing.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${existing.file_name}"`);
    fs.createReadStream(physicalPath).pipe(res);
  }
}

module.exports = new PublicDocumentService();
