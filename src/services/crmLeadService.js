const pool = require('../config/database');
const crmLeadRepository = require('../repositories/crmLeadRepository');
const auditService = require('./auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');
const { CRM_LEAD_STATUS, CRM_LEAD_STATUS_LABELS, getStatusOptions } = require('../constants/crmLeadStatus');

class CrmLeadService {
  _getInstitutionScope(user) {
    if (!user) return [];
    const isSuperAdmin = (user.roles && user.roles.includes('SUPER_ADMIN')) || user.primaryRole === 'SUPER_ADMIN';
    if (isSuperAdmin) {
      return null; // Unlimited scope
    }

    const institutions = user.institutions || [];
    return institutions.map(i => (typeof i === 'object' && i !== null ? i.id : i));
  }

  _checkScope(lead, scope) {
    if (scope === null) return true;
    if (!scope || scope.length === 0) return false;
    return scope.map(Number).includes(Number(lead.institution_id));
  }

  async getLeads(params, user) {
    const scope = this._getInstitutionScope(user);

    if (scope !== null) {
      if (scope.length === 0) {
        return {
          data: [],
          meta: {
            page: Number(params.page) || 1,
            limit: Number(params.limit) || 10,
            total: 0,
            totalPages: 0,
            stats: {
              total: 0,
              newCount: 0,
              inProgress: 0,
              converted: 0
            }
          }
        };
      }

      if (params.institutionId) {
        const requestedId = Number(params.institutionId);
        if (!scope.map(Number).includes(requestedId)) {
          const err = new Error('Anda tidak memiliki izin untuk melihat data lembaga ini.');
          err.statusCode = 403;
          throw err;
        }
      } else {
        params.institutionScope = scope;
      }
    }

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));
    params.page = page;
    params.limit = limit;

    const [leads, total, stats] = await Promise.all([
      crmLeadRepository.findLeads(params),
      crmLeadRepository.countLeads(params),
      crmLeadRepository.getLeadStats(params)
    ]);

    const formattedLeads = leads.map(l => ({
      id: l.id,
      institutionId: l.institution_id,
      institution: {
        id: l.institution_id,
        name: l.institution_name,
        code: l.institution_code
      },
      fullName: l.full_name,
      schoolOrigin: l.school_origin || '-',
      address: l.address || '-',
      phone: l.phone || '-',
      fatherName: l.father_name || '-',
      motherName: l.mother_name || '-',
      interest: l.interest || '-',
      status: l.status,
      statusLabel: CRM_LEAD_STATUS_LABELS[l.status] || l.status,
      leadSource: l.lead_source || '-',
      leadBy: l.lead_by_user_id ? {
        id: l.lead_by_user_id,
        name: l.lead_by_name,
        username: l.lead_by_username
      } : null,
      createdBy: {
        id: l.created_by_user_id,
        name: l.created_by_name
      },
      application: l.application_id ? {
        id: l.application_id,
        registrationNumber: l.application_registration_number,
        status: l.application_status
      } : null,
      lastContactedAt: l.last_contacted_at,
      nextFollowUpAt: l.next_follow_up_at,
      notes: l.notes || '',
      createdAt: l.created_at,
      updatedAt: l.updated_at
    }));

    return {
      data: formattedLeads,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        stats
      }
    };
  }

  async getLeadStats(params = {}, user) {
    const scope = this._getInstitutionScope(user);

    if (scope !== null) {
      if (scope.length === 0) {
        return {
          total: 0,
          newCount: 0,
          inProgress: 0,
          converted: 0
        };
      }

      if (params.institutionId) {
        const requestedId = Number(params.institutionId);
        if (!scope.map(Number).includes(requestedId)) {
          const err = new Error('Anda tidak memiliki izin untuk melihat data lembaga ini.');
          err.statusCode = 403;
          throw err;
        }
      } else {
        params.institutionScope = scope;
      }
    }

    return await crmLeadRepository.getLeadStats(params);
  }

  async getLeadById(id, user) {
    const lead = await crmLeadRepository.findLeadById(id);
    if (!lead) {
      const err = new Error('Data lead tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(lead, scope)) {
      const err = new Error('Anda tidak memiliki izin untuk mengakses data lead ini.');
      err.statusCode = 403;
      throw err;
    }

    const histories = await crmLeadRepository.findStatusHistoriesByLeadId(id);

    return {
      id: lead.id,
      institutionId: lead.institution_id,
      institution: {
        id: lead.institution_id,
        name: lead.institution_name,
        code: lead.institution_code
      },
      fullName: lead.full_name,
      schoolOrigin: lead.school_origin || '',
      address: lead.address || '',
      phone: lead.phone || '',
      fatherName: lead.father_name || '',
      motherName: lead.mother_name || '',
      interest: lead.interest || '',
      status: lead.status,
      statusLabel: CRM_LEAD_STATUS_LABELS[lead.status] || lead.status,
      leadSource: lead.lead_source || '',
      leadBy: lead.lead_by_user_id ? {
        id: lead.lead_by_user_id,
        name: lead.lead_by_name,
        username: lead.lead_by_username,
        phone: lead.lead_by_phone
      } : null,
      createdBy: {
        id: lead.created_by_user_id,
        name: lead.created_by_name,
        username: lead.created_by_username
      },
      application: lead.application_id ? {
        id: lead.application_id,
        registrationNumber: lead.application_registration_number,
        status: lead.application_status,
        submittedAt: lead.application_submitted_at
      } : null,
      lastContactedAt: lead.last_contacted_at,
      nextFollowUpAt: lead.next_follow_up_at,
      notes: lead.notes || '',
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
      statusHistories: histories.map(h => ({
        id: h.id,
        previousStatus: h.previous_status,
        previousStatusLabel: h.previous_status ? (CRM_LEAD_STATUS_LABELS[h.previous_status] || h.previous_status) : '-',
        newStatus: h.new_status,
        newStatusLabel: CRM_LEAD_STATUS_LABELS[h.new_status] || h.new_status,
        notes: h.notes || '',
        changedBy: {
          id: h.changed_by_user_id,
          name: h.changed_by_name,
          username: h.changed_by_username
        },
        createdAt: h.created_at
      }))
    };
  }

  async createLead(data, user, req = null) {
    if (!data.full_name || data.full_name.trim() === '') {
      const err = new Error('Nama lengkap calon peserta didik wajib diisi.');
      err.statusCode = 422;
      throw err;
    }

    const scope = this._getInstitutionScope(user);

    // Auto-assign institution if not explicitly provided for scoped users (e.g. school admin SMK)
    if (!data.institution_id && scope !== null && scope.length > 0) {
      data.institution_id = scope[0];
    }

    if (!data.institution_id) {
      const err = new Error('Lembaga wajib dipilih.');
      err.statusCode = 422;
      throw err;
    }

    if (scope !== null) {
      if (!scope.map(Number).includes(Number(data.institution_id))) {
        const err = new Error('Anda tidak memiliki izin untuk membuat lead pada lembaga ini.');
        err.statusCode = 403;
        throw err;
      }
    }

    const institution = await crmLeadRepository.findInstitutionById(data.institution_id);
    if (!institution) {
      const err = new Error('Lembaga yang dipilih tidak valid.');
      err.statusCode = 422;
      throw err;
    }

    let initialStatus = CRM_LEAD_STATUS.NEW;
    if (data.status) {
      if (!Object.values(CRM_LEAD_STATUS).includes(data.status)) {
        const err = new Error(`Status tidak valid. Pilihan: ${Object.values(CRM_LEAD_STATUS).join(', ')}`);
        err.statusCode = 422;
        throw err;
      }
      initialStatus = data.status;
    }

    let leadByUserId = null;
    if (data.lead_by_user_id) {
      const officer = await crmLeadRepository.findUserById(data.lead_by_user_id);
      if (!officer) {
        const err = new Error('Petugas Lead By yang dipilih tidak valid.');
        err.statusCode = 422;
        throw err;
      }
      leadByUserId = data.lead_by_user_id;
    }

    let applicationId = null;
    if (data.application_id) {
      const app = await crmLeadRepository.findApplicationById(data.application_id);
      if (!app) {
        const err = new Error('Aplikasi pendaftaran yang dirujuk tidak ditemukan.');
        err.statusCode = 422;
        throw err;
      }
      applicationId = data.application_id;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const leadData = {
        institution_id: data.institution_id,
        full_name: data.full_name.trim(),
        school_origin: data.school_origin ? data.school_origin.trim() : null,
        address: data.address ? data.address.trim() : null,
        phone: data.phone ? data.phone.trim() : null,
        father_name: data.father_name ? data.father_name.trim() : null,
        mother_name: data.mother_name ? data.mother_name.trim() : null,
        interest: data.interest ? data.interest.trim() : null,
        status: initialStatus,
        lead_source: data.lead_source ? data.lead_source.trim() : null,
        lead_by_user_id: leadByUserId,
        created_by_user_id: user.id,
        application_id: applicationId,
        last_contacted_at: data.last_contacted_at || null,
        next_follow_up_at: data.next_follow_up_at || null,
        notes: data.notes ? data.notes.trim() : null
      };

      const leadId = await crmLeadRepository.createLead(leadData, connection);

      // Record initial status history
      await crmLeadRepository.createStatusHistory({
        lead_id: leadId,
        previous_status: null,
        new_status: initialStatus,
        changed_by_user_id: user.id,
        notes: data.history_notes || 'Lead baru dicatat'
      }, connection);

      await connection.commit();

      // Audit log
      if (auditService && req) {
        await auditService.log(
          AUDIT_ACTIONS.CRM_LEAD_CREATE,
          'CRM_LEAD',
          leadId,
          `Menambahkan lead baru "${leadData.full_name}" untuk lembaga ${institution.name}.`,
          req
        );
      }

      return await this.getLeadById(leadId, user);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async updateLead(id, data, user, req = null) {
    const existing = await crmLeadRepository.findLeadById(id);
    if (!existing) {
      const err = new Error('Data lead tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(existing, scope)) {
      const err = new Error('Anda tidak memiliki izin untuk mengedit lead ini.');
      err.statusCode = 403;
      throw err;
    }

    // Target institution check
    const targetInstitutionId = data.institution_id ? Number(data.institution_id) : existing.institution_id;
    if (scope !== null) {
      if (!scope.map(Number).includes(targetInstitutionId)) {
        const err = new Error('Anda tidak memiliki izin untuk memindahkan lead ke lembaga ini.');
        err.statusCode = 403;
        throw err;
      }
    }

    if (data.institution_id && data.institution_id !== existing.institution_id) {
      const inst = await crmLeadRepository.findInstitutionById(data.institution_id);
      if (!inst) {
        const err = new Error('Lembaga tujuan tidak valid.');
        err.statusCode = 422;
        throw err;
      }
    }

    if (data.full_name !== undefined && data.full_name.trim() === '') {
      const err = new Error('Nama lengkap tidak boleh kosong.');
      err.statusCode = 422;
      throw err;
    }

    let targetStatus = existing.status;
    if (data.status !== undefined) {
      if (!Object.values(CRM_LEAD_STATUS).includes(data.status)) {
        const err = new Error(`Status tidak valid. Pilihan: ${Object.values(CRM_LEAD_STATUS).join(', ')}`);
        err.statusCode = 422;
        throw err;
      }
      targetStatus = data.status;
    }

    let targetLeadByUserId = existing.lead_by_user_id;
    if (data.lead_by_user_id !== undefined) {
      if (data.lead_by_user_id === null || data.lead_by_user_id === '') {
        targetLeadByUserId = null;
      } else {
        const officer = await crmLeadRepository.findUserById(data.lead_by_user_id);
        if (!officer) {
          const err = new Error('Petugas Lead By tidak valid.');
          err.statusCode = 422;
          throw err;
        }
        targetLeadByUserId = data.lead_by_user_id;
      }
    }

    let targetApplicationId = existing.application_id;
    if (data.application_id !== undefined) {
      if (data.application_id === null || data.application_id === '') {
        targetApplicationId = null;
      } else {
        const app = await crmLeadRepository.findApplicationById(data.application_id);
        if (!app) {
          const err = new Error('Aplikasi pendaftaran tidak valid.');
          err.statusCode = 422;
          throw err;
        }
        targetApplicationId = data.application_id;
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const updateData = {
        institution_id: targetInstitutionId,
        full_name: data.full_name !== undefined ? data.full_name.trim() : existing.full_name,
        school_origin: data.school_origin !== undefined ? (data.school_origin ? data.school_origin.trim() : null) : existing.school_origin,
        address: data.address !== undefined ? (data.address ? data.address.trim() : null) : existing.address,
        phone: data.phone !== undefined ? (data.phone ? data.phone.trim() : null) : existing.phone,
        father_name: data.father_name !== undefined ? (data.father_name ? data.father_name.trim() : null) : existing.father_name,
        mother_name: data.mother_name !== undefined ? (data.mother_name ? data.mother_name.trim() : null) : existing.mother_name,
        interest: data.interest !== undefined ? (data.interest ? data.interest.trim() : null) : existing.interest,
        status: targetStatus,
        lead_source: data.lead_source !== undefined ? (data.lead_source ? data.lead_source.trim() : null) : existing.lead_source,
        lead_by_user_id: targetLeadByUserId,
        application_id: targetApplicationId,
        last_contacted_at: data.last_contacted_at !== undefined ? data.last_contacted_at : existing.last_contacted_at,
        next_follow_up_at: data.next_follow_up_at !== undefined ? data.next_follow_up_at : existing.next_follow_up_at,
        notes: data.notes !== undefined ? (data.notes ? data.notes.trim() : null) : existing.notes
      };

      await crmLeadRepository.updateLead(id, updateData, connection);

      // Record history ONLY if status changed
      if (targetStatus !== existing.status) {
        await crmLeadRepository.createStatusHistory({
          lead_id: id,
          previous_status: existing.status,
          new_status: targetStatus,
          changed_by_user_id: user.id,
          notes: data.history_notes || data.status_notes || `Status diubah dari ${CRM_LEAD_STATUS_LABELS[existing.status] || existing.status} menjadi ${CRM_LEAD_STATUS_LABELS[targetStatus] || targetStatus}`
        }, connection);
      }

      await connection.commit();

      if (auditService && req) {
        await auditService.log(
          AUDIT_ACTIONS.CRM_LEAD_UPDATE,
          'CRM_LEAD',
          id,
          `Memperbarui data lead "${updateData.full_name}".`,
          req
        );
      }

      return await this.getLeadById(id, user);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async updateLeadStatus(id, { status, notes }, user, req = null) {
    if (!status || !Object.values(CRM_LEAD_STATUS).includes(status)) {
      const err = new Error(`Status tidak valid. Pilihan: ${Object.values(CRM_LEAD_STATUS).join(', ')}`);
      err.statusCode = 422;
      throw err;
    }

    const existing = await crmLeadRepository.findLeadById(id);
    if (!existing) {
      const err = new Error('Data lead tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(existing, scope)) {
      const err = new Error('Anda tidak memiliki izin untuk mengubah status lead ini.');
      err.statusCode = 403;
      throw err;
    }

    if (existing.status === status) {
      // Nothing changed
      return await this.getLeadById(id, user);
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await crmLeadRepository.updateLeadStatus(id, status, connection);

      await crmLeadRepository.createStatusHistory({
        lead_id: id,
        previous_status: existing.status,
        new_status: status,
        changed_by_user_id: user.id,
        notes: notes ? notes.trim() : `Perubahan status menjadi ${CRM_LEAD_STATUS_LABELS[status] || status}`
      }, connection);

      await connection.commit();

      if (auditService && req) {
        await auditService.log(
          AUDIT_ACTIONS.CRM_LEAD_STATUS_CHANGE,
          'CRM_LEAD',
          id,
          `Status lead "${existing.full_name}" diubah dari ${existing.status} ke ${status}.`,
          req
        );
      }

      return await this.getLeadById(id, user);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async deleteLead(id, user, req = null) {
    const existing = await crmLeadRepository.findLeadById(id);
    if (!existing) {
      const err = new Error('Data lead tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(existing, scope)) {
      const err = new Error('Anda tidak memiliki izin untuk menghapus lead ini.');
      err.statusCode = 403;
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await crmLeadRepository.deleteLead(id, connection);

      await connection.commit();

      if (auditService && req) {
        await auditService.log(
          AUDIT_ACTIONS.CRM_LEAD_DELETE,
          'CRM_LEAD',
          id,
          `Menghapus lead "${existing.full_name}" dari lembaga ${existing.institution_name}.`,
          req
        );
      }

      return true;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async getStatusHistories(leadId, user) {
    const existing = await crmLeadRepository.findLeadById(leadId);
    if (!existing) {
      const err = new Error('Data lead tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const scope = this._getInstitutionScope(user);
    if (!this._checkScope(existing, scope)) {
      const err = new Error('Anda tidak memiliki izin untuk melihat riwayat lead ini.');
      err.statusCode = 403;
      throw err;
    }

    const histories = await crmLeadRepository.findStatusHistoriesByLeadId(leadId);
    return histories.map(h => ({
      id: h.id,
      leadId: h.lead_id,
      previousStatus: h.previous_status,
      previousStatusLabel: h.previous_status ? (CRM_LEAD_STATUS_LABELS[h.previous_status] || h.previous_status) : '-',
      newStatus: h.new_status,
      newStatusLabel: CRM_LEAD_STATUS_LABELS[h.new_status] || h.new_status,
      notes: h.notes || '',
      changedBy: {
        id: h.changed_by_user_id,
        name: h.changed_by_name,
        username: h.changed_by_username
      },
      createdAt: h.created_at
    }));
  }

  async getOfficerOptions(user) {
    const scope = this._getInstitutionScope(user);
    const officers = await crmLeadRepository.findEligibleOfficers(scope);
    return officers.map(o => ({
      id: o.id,
      name: o.name,
      username: o.username,
      phone: o.phone || '-'
    }));
  }

  getStatusOptions() {
    return getStatusOptions();
  }

  generateImportTemplate() {
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();

    const headers = [
      'Nama Lengkap',
      'No. WhatsApp',
      'Asal Sekolah',
      'Alamat',
      'Nama Ayah',
      'Nama Ibu',
      'Minat',
      'Sumber Lead',
      'Status',
      'Catatan',
      'Lembaga'
    ];

    const sampleRows = [
      headers,
      [
        'Ahmad Rayhan',
        '081234567890',
        'SMP Negeri 1 Malang',
        'Jl. Raya Asy-Syadzili No. 10',
        'Bapak Ahmad',
        'Ibu Siti',
        'RPL (Rekayasa Perangkat Lunak)',
        'Media Sosial',
        'NEW',
        'Berminat fasilitas asrama',
        'SMK IT Asy-Syadzili'
      ],
      [
        'Fatimah Zahra',
        '089876543210',
        'MTs Negeri 2 Pasuruan',
        'Jl. Melati No. 5 Pasuruan',
        'Bapak Umar',
        'Ibu Khadijah',
        'Tahfidz Al-Quran',
        'Brosur',
        'NEW',
        'Ingin fokus tahfidz 30 juz',
        'SMA IT Asy-Syadzili'
      ]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(sampleRows);

    worksheet['!cols'] = [
      { wch: 25 },
      { wch: 18 },
      { wch: 25 },
      { wch: 30 },
      { wch: 20 },
      { wch: 20 },
      { wch: 25 },
      { wch: 18 },
      { wch: 14 },
      { wch: 30 },
      { wch: 25 }
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Lead');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  async importLeads(body, file, user, req = null) {
    const XLSX = require('xlsx');
    let rows = [];

    if (file && file.buffer) {
      try {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          const err = new Error('File Excel tidak memiliki lembar kerja (sheet).');
          err.statusCode = 422;
          throw err;
        }
        const worksheet = workbook.Sheets[firstSheetName];
        rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
      } catch (parseErr) {
        if (parseErr.statusCode) throw parseErr;
        const err = new Error('Gagal membaca file Excel/CSV. Pastikan format file valid (.xlsx, .xls, .csv).');
        err.statusCode = 422;
        throw err;
      }
    } else if (body && Array.isArray(body.leads)) {
      rows = body.leads;
    } else if (body && typeof body.leads === 'string') {
      try {
        rows = JSON.parse(body.leads);
      } catch (e) {
        const err = new Error('Format data leads tidak valid JSON.');
        err.statusCode = 422;
        throw err;
      }
    } else {
      const err = new Error('File import atau data lead wajib dikirim.');
      err.statusCode = 422;
      throw err;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      const err = new Error('Data import kosong atau tidak ada baris yang valid.');
      err.statusCode = 422;
      throw err;
    }

    const scope = this._getInstitutionScope(user);
    let defaultInstitutionId = body && body.institution_id ? Number(body.institution_id) : null;

    if (!defaultInstitutionId && scope !== null && scope.length > 0) {
      defaultInstitutionId = Number(scope[0]);
    }

    if (defaultInstitutionId && scope !== null) {
      if (!scope.map(Number).includes(defaultInstitutionId)) {
        const err = new Error('Anda tidak memiliki izin untuk mengimpor lead pada lembaga ini.');
        err.statusCode = 403;
        throw err;
      }
    }

    const [allInstitutions] = await pool.query('SELECT id, code, name FROM institutions WHERE is_active = 1');
    const institutionByNameOrCode = {};
    for (const inst of allInstitutions) {
      institutionByNameOrCode[inst.name.toLowerCase().trim()] = inst.id;
      institutionByNameOrCode[inst.code.toLowerCase().trim()] = inst.id;
    }

    const normalizeKey = (key) => String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const getField = (row, aliases) => {
      for (const alias of aliases) {
        if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
          return String(row[alias]).trim();
        }
      }
      const rowKeys = Object.keys(row);
      for (const alias of aliases) {
        const normAlias = normalizeKey(alias);
        const matchedKey = rowKeys.find(k => normalizeKey(k) === normAlias);
        if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null && String(row[matchedKey]).trim() !== '') {
          return String(row[matchedKey]).trim();
        }
      }
      return null;
    };

    const validStatuses = Object.values(CRM_LEAD_STATUS);

    const connection = await pool.getConnection();
    const results = {
      totalRows: rows.length,
      importedCount: 0,
      skippedCount: 0,
      errors: []
    };

    try {
      await connection.beginTransaction();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 2;

        const fullName = getField(row, [
          'Nama Lengkap', 'Nama Siswa', 'Nama Calon Siswa', 'Nama Calon Santri',
          'Nama Santri', 'Nama', 'Full Name', 'Name', 'full_name'
        ]);

        if (!fullName) {
          results.skippedCount++;
          continue;
        }

        let rowInstId = defaultInstitutionId;
        const rowInstName = getField(row, ['Lembaga', 'Institusi', 'Institution', 'Kode Lembaga', 'Sekolah Dituju', 'institution', 'institution_id']);
        if (rowInstName) {
          if (!isNaN(rowInstName) && Number(rowInstName) > 0) {
            const parsedId = Number(rowInstName);
            if (scope === null || scope.map(Number).includes(parsedId)) {
              rowInstId = parsedId;
            }
          } else {
            const matched = institutionByNameOrCode[rowInstName.toLowerCase().trim()];
            if (matched) {
              if (scope === null || scope.map(Number).includes(Number(matched))) {
                rowInstId = matched;
              }
            }
          }
        }

        if (!rowInstId) {
          results.skippedCount++;
          results.errors.push(`Baris ${rowNumber} (${fullName}): Lembaga tidak ditentukan atau tidak valid.`);
          continue;
        }

        // Clean phone number
        let phone = getField(row, [
          'No. WhatsApp', 'Nomor WhatsApp', 'No WhatsApp', 'No WA',
          'Nomor HP', 'No HP', 'Telepon', 'WhatsApp', 'Phone', 'phone', 'whatsapp'
        ]);
        if (phone) {
          phone = String(phone).replace(/\s+/g, '');
          if (phone.startsWith('8')) phone = '0' + phone;
        }

        const rawStatus = (getField(row, ['Status', 'status']) || '').toUpperCase().trim();
        let status = CRM_LEAD_STATUS.NEW;
        if (validStatuses.includes(rawStatus)) {
          status = rawStatus;
        } else if (rawStatus.includes('FOLLOW')) {
          status = CRM_LEAD_STATUS.FOLLOW_UP;
        } else if (rawStatus.includes('SURVEY') || rawStatus.includes('SURVEI')) {
          status = CRM_LEAD_STATUS.SURVEY;
        } else if (rawStatus.includes('DAFTAR') || rawStatus.includes('REGIST')) {
          status = CRM_LEAD_STATUS.REGISTERED;
        } else if (rawStatus.includes('TERIMA') || rawStatus.includes('MASUK') || rawStatus.includes('ENROLL')) {
          status = CRM_LEAD_STATUS.ENROLLED;
        } else if (rawStatus.includes('BATAL') || rawStatus.includes('DROP')) {
          status = CRM_LEAD_STATUS.DROPPED;
        }

        const leadData = {
          institution_id: rowInstId,
          full_name: fullName,
          school_origin: getField(row, ['Asal Sekolah', 'Sekolah Asal', 'Sekolah', 'School Origin', 'school_origin']),
          address: getField(row, ['Alamat', 'Alamat Lengkap', 'Address', 'address']),
          phone: phone,
          father_name: getField(row, ['Nama Ayah', 'Ayah', 'Father Name', 'father_name']),
          mother_name: getField(row, ['Nama Ibu', 'Ibu', 'Mother Name', 'mother_name']),
          interest: getField(row, ['Minat', 'Peminatan', 'Jurusan', 'Interest', 'Program', 'interest']),
          status: status,
          lead_source: getField(row, ['Sumber Lead', 'Sumber', 'Sumber Informasi', 'Lead Source', 'lead_source']) || 'Import Excel',
          lead_by_user_id: null,
          created_by_user_id: user.id,
          application_id: null,
          last_contacted_at: null,
          next_follow_up_at: null,
          notes: getField(row, ['Catatan', 'Keterangan', 'Notes', 'notes'])
        };

        const leadId = await crmLeadRepository.createLead(leadData, connection);
        await crmLeadRepository.createStatusHistory({
          lead_id: leadId,
          previous_status: null,
          new_status: status,
          changed_by_user_id: user.id,
          notes: 'Lead diimpor via file'
        }, connection);

        results.importedCount++;
      }

      await connection.commit();

      if (auditService && req && results.importedCount > 0) {
        await auditService.log(
          AUDIT_ACTIONS.CRM_LEAD_IMPORT || 'CRM_LEAD_IMPORT',
          'CRM_LEAD',
          null,
          `User melakukan impor massal ${results.importedCount} data lead.`,
          req
        );
      }

      return results;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

module.exports = new CrmLeadService();
