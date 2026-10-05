
const repo = require('../repositories/formFieldRepository');
const targetRepo = require('../repositories/formTargetRepository');
const sectionRepo = require('../repositories/formSectionRepository');
const pool = require('../config/database');

class FormFieldService {
  async getAll(query, user) {
    const isSuper = user.roles.includes('SUPER_ADMIN');
    let targetIds = undefined;
    
    if (!isSuper) {
      const allowedInstIds = user.institutions || [];
      const targets = await targetRepo.findAll({});
      const allowedTargets = targets.filter(t => 
        t.target_type === 'COMMON' || 
        t.target_type === 'PONDOK_COMMON' || 
        (t.target_type === 'INSTITUTION' && allowedInstIds.includes(t.institution_id))
      );
      targetIds = allowedTargets.map(t => t.id);
      if (targetIds.length === 0) return { data: [] };
    }

    const rows = await repo.findAll({
      targetId: query.targetId,
      sectionId: query.sectionId,
      inputType: query.inputType,
      search: query.search,
      status: query.status,
      targetIds
    });
    
    return { data: rows.map(this.format) };
  }

  async getById(id, user) {
    const row = await repo.findById(id);
    if (!row) throw { status: 404, message: 'Field tidak ditemukan' };
    
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) {
      if (row.target_type === 'INSTITUTION' && !(user.institutions || []).includes(row.institution_id)) {
        throw { status: 403, message: 'Akses ditolak' };
      }
    }
    
    return this.format(row);
  }

  async create(data, user) {
    // Permission check
    const target = await targetRepo.findById(data.formTargetId);
    if (!target) throw { status: 422, message: 'Form target tidak ditemukan' };
    
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) {
      if (target.target_type === 'COMMON' || target.target_type === 'PONDOK_COMMON') {
        throw { status: 403, message: 'Akses ditolak. Tidak dapat membuat field global' };
      }
      if (target.target_type === 'INSTITUTION' && !(user.institutions || []).includes(target.institution_id)) {
        throw { status: 403, message: 'Akses ditolak. Target institution bukan wewenang anda' };
      }
    }

    // Validation
    if (!data.formSectionId || !data.fieldCode || !data.label || !data.inputType) {
      throw { status: 422, message: 'Data tidak lengkap' };
    }
    if (!/^[a-z][a-z0-9_]*$/.test(data.fieldCode)) {
      throw { status: 422, message: 'Field code hanya boleh berisi huruf kecil, angka dan underscore, serta diawali huruf.' };
    }
    
    const validInputs = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'SELECT', 'RADIO', 'CHECKBOX', 'EMAIL', 'PHONE'];
    if (!validInputs.includes(data.inputType)) {
      throw { status: 422, message: 'Input type tidak valid' };
    }
    
    const section = await sectionRepo.findById(data.formSectionId);
    if (!section) throw { status: 422, message: 'Section tidak ditemukan' };

    if (await repo.checkDuplicateCode(data.formTargetId, data.fieldCode)) {
      throw { status: 409, message: 'Field code sudah digunakan pada target form ini' };
    }

    // Transaction
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      const insertData = {
        form_section_id: data.formSectionId,
        form_target_id: data.formTargetId,
        field_code: data.fieldCode,
        label: data.label,
        input_type: data.inputType,
        placeholder: data.placeholder || null,
        help_text: data.helpText || null,
        is_required: data.isRequired ? 1 : 0,
        sort_order: data.sortOrder || 99,
        is_active: data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1
      };
      
      const [res] = await connection.query('INSERT INTO form_fields SET ?', [insertData]);
      const newId = res.insertId;
      
      // Options
      if (['SELECT', 'RADIO', 'CHECKBOX'].includes(data.inputType) && Array.isArray(data.options)) {
        // check unique option values
        const values = data.options.map(o => o.value);
        if (new Set(values).size !== values.length) {
          throw { status: 409, message: 'Option value tidak boleh ada yang duplikat' };
        }
        for (const opt of data.options) {
          if (!opt.label || !opt.value) throw { status: 422, message: 'Label dan value option harus diisi' };
          await connection.query('INSERT INTO form_field_options SET ?', [{
            form_field_id: newId,
            label: opt.label,
            option_value: opt.value,
            sort_order: opt.sortOrder || 99,
            is_active: opt.isActive !== undefined ? (opt.isActive ? 1 : 0) : 1
          }]);
        }
      }
      
      await connection.commit();
      return this.getById(newId, user);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async update(id, data, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Field tidak ditemukan' };
    
    // Permission check
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) {
      if (existing.target_type === 'COMMON' || existing.target_type === 'PONDOK_COMMON') {
        throw { status: 403, message: 'Akses ditolak. Tidak dapat mengubah field global' };
      }
      if (existing.target_type === 'INSTITUTION' && !(user.institutions || []).includes(existing.institution_id)) {
        throw { status: 403, message: 'Akses ditolak' };
      }
    }

    const updateData = {};
    if (data.fieldCode && data.fieldCode !== existing.field_code) {
      if (!/^[a-z][a-z0-9_]*$/.test(data.fieldCode)) {
        throw { status: 422, message: 'Field code hanya boleh berisi huruf kecil, angka dan underscore, serta diawali huruf.' };
      }
      if (await repo.checkDuplicateCode(existing.form_target_id, data.fieldCode, id)) {
        throw { status: 409, message: 'Field code sudah digunakan pada target form ini' };
      }
      updateData.field_code = data.fieldCode;
    }
    
    if (data.formSectionId !== undefined && data.formSectionId !== existing.form_section_id) {
      const section = await sectionRepo.findById(data.formSectionId);
      if (!section) throw { status: 422, message: 'Section tidak ditemukan' };
      updateData.form_section_id = data.formSectionId;
    }
    
    if (data.label !== undefined) updateData.label = data.label;
    if (data.inputType !== undefined) {
      const validInputs = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'SELECT', 'RADIO', 'CHECKBOX', 'EMAIL', 'PHONE'];
      if (!validInputs.includes(data.inputType)) throw { status: 422, message: 'Input type tidak valid' };
      updateData.input_type = data.inputType;
    }
    if (data.placeholder !== undefined) updateData.placeholder = data.placeholder;
    if (data.helpText !== undefined) updateData.help_text = data.helpText;
    if (data.isRequired !== undefined) updateData.is_required = data.isRequired ? 1 : 0;
    if (data.sortOrder !== undefined) updateData.sort_order = data.sortOrder;
    if (data.isActive !== undefined) updateData.is_active = data.isActive ? 1 : 0;

    const currentInputType = updateData.input_type || existing.input_type;
    const usesOptions = ['SELECT', 'RADIO', 'CHECKBOX'].includes(currentInputType);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      if (Object.keys(updateData).length > 0) {
        await connection.query('UPDATE form_fields SET ? WHERE id = ?', [updateData, id]);
      }
      
      // Update options
      if (usesOptions && data.options !== undefined && Array.isArray(data.options)) {
        const values = data.options.map(o => o.value);
        if (new Set(values).size !== values.length) {
          throw { status: 409, message: 'Option value tidak boleh ada yang duplikat' };
        }
        
        // delete all current options and re-insert is simpler but breaks FK if any application answer relies on option id.
        // Wait, application answers store form_field_id and string values, not option ID usually, but wait, DB structure: application_answers has form_field_id and value.
        // Option is safe to delete/reinsert, but it's better to update.
        // I will just delete existing and insert new since it's much simpler and matches usual behaviour unless there is FK to form_field_options.
        // Looking at prompt: "menyimpan jawaban berdasarkan form_field_id bukan option id. Jadi option secara database relatif aman untuk diubah"
        
        await connection.query('DELETE FROM form_field_options WHERE form_field_id = ?', [id]);
        for (const opt of data.options) {
          if (!opt.label || !opt.value) throw { status: 422, message: 'Label dan value option harus diisi' };
          await connection.query('INSERT INTO form_field_options SET ?', [{
            form_field_id: id,
            label: opt.label,
            option_value: opt.value,
            sort_order: opt.sortOrder || 99,
            is_active: opt.isActive !== undefined ? (opt.isActive ? 1 : 0) : 1
          }]);
        }
      } else if (!usesOptions) {
        // clear options if changed to TEXT etc
        await connection.query('DELETE FROM form_field_options WHERE form_field_id = ?', [id]);
      }
      
      await connection.commit();
      return this.getById(id, user);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async updateStatus(id, isActive, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Field tidak ditemukan' };
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) {
      if (existing.target_type === 'COMMON' || existing.target_type === 'PONDOK_COMMON') throw { status: 403, message: 'Akses ditolak' };
      if (existing.target_type === 'INSTITUTION' && !(user.institutions || []).includes(existing.institution_id)) throw { status: 403, message: 'Akses ditolak' };
    }
    
    await pool.query('UPDATE form_fields SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
    return this.getById(id, user);
  }

  async updateRequired(id, isRequired, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Field tidak ditemukan' };
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) {
      if (existing.target_type === 'COMMON' || existing.target_type === 'PONDOK_COMMON') throw { status: 403, message: 'Akses ditolak' };
      if (existing.target_type === 'INSTITUTION' && !(user.institutions || []).includes(existing.institution_id)) throw { status: 403, message: 'Akses ditolak' };
    }
    
    await pool.query('UPDATE form_fields SET is_required = ? WHERE id = ?', [isRequired ? 1 : 0, id]);
    return this.getById(id, user);
  }

  async updateOrder(id, sortOrder, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Field tidak ditemukan' };
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) {
      if (existing.target_type === 'COMMON' || existing.target_type === 'PONDOK_COMMON') throw { status: 403, message: 'Akses ditolak' };
      if (existing.target_type === 'INSTITUTION' && !(user.institutions || []).includes(existing.institution_id)) throw { status: 403, message: 'Akses ditolak' };
    }
    
    await pool.query('UPDATE form_fields SET sort_order = ? WHERE id = ?', [sortOrder, id]);
    return this.getById(id, user);
  }

  async delete(id, user) {
    const existing = await repo.findById(id);
    if (!existing) throw { status: 404, message: 'Field tidak ditemukan' };
    
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) {
      if (existing.target_type === 'COMMON' || existing.target_type === 'PONDOK_COMMON') throw { status: 403, message: 'Akses ditolak' };
      if (existing.target_type === 'INSTITUTION' && !(user.institutions || []).includes(existing.institution_id)) throw { status: 403, message: 'Akses ditolak' };
    }
    
    // Check if used in application_answers
    const [answers] = await pool.query('SELECT id FROM application_answers WHERE form_field_id = ? LIMIT 1', [id]);
    if (answers.length > 0) {
      throw { status: 409, message: 'Field sudah digunakan pada data pendaftaran dan tidak dapat dihapus. Nonaktifkan field sebagai gantinya.' };
    }
    
    await pool.query('DELETE FROM form_fields WHERE id = ?', [id]);
    return { success: true };
  }

  format(row) {
    return {
      id: row.id,
      fieldCode: row.field_code,
      label: row.label,
      inputType: row.input_type,
      placeholder: row.placeholder,
      helpText: row.help_text,
      isRequired: !!row.is_required,
      sortOrder: row.sort_order,
      isActive: !!row.is_active,
      section: {
        id: row.form_section_id,
        code: row.section_code,
        name: row.section_name
      },
      target: {
        id: row.form_target_id,
        code: row.target_code,
        name: row.target_name,
        targetType: row.target_type,
        institutionId: row.institution_id
      },
      options: (row.options || []).map(o => ({
        id: o.id,
        label: o.label,
        value: o.option_value,
        sortOrder: o.sort_order,
        isActive: !!o.is_active
      }))
    };
  }
}
module.exports = new FormFieldService();
