
const pool = require('../config/database');

class FormConfigController {
  async getEffectiveForm(req, res, next) {
    try {
      const { institutionId, includePondok } = req.query;
      const instId = parseInt(institutionId);
      
      const isSuper = req.user.roles.includes('SUPER_ADMIN');
      if (!isSuper) {
        if (!req.user.institutions.includes(instId)) {
          return res.status(403).json({ success: false, message: 'Akses ditolak' });
        }
      }
      
      // Get institution info
      const [instRows] = await pool.query('SELECT id, name FROM institutions WHERE id = ?', [instId]);
      if (instRows.length === 0) return res.status(404).json({ success: false, message: 'Lembaga tidak ditemukan' });
      
      // Get targets
      const targetTypes = ['COMMON'];
      if (includePondok === 'true') targetTypes.push('PONDOK_COMMON');
      
      const [targets] = await pool.query('SELECT id, target_type FROM form_targets WHERE (target_type IN (?) OR (target_type = "INSTITUTION" AND institution_id = ?)) AND is_active = 1', [targetTypes, instId]);
      const targetIds = targets.map(t => t.id);
      
      if (targetIds.length === 0) {
        return res.json({ success: true, data: { institution: instRows[0], sections: [] } });
      }
      
      // Get sections
      const [sections] = await pool.query('SELECT * FROM form_sections WHERE is_active = 1 ORDER BY sort_order ASC, id ASC');
      
      // Get fields
      const [fields] = await pool.query(`
        SELECT f.*, t.target_type 
        FROM form_fields f 
        JOIN form_targets t ON f.form_target_id = t.id
        WHERE f.form_target_id IN (?) AND f.is_active = 1 
        ORDER BY f.sort_order ASC, f.id ASC
      `, [targetIds]);
      
      const fieldIds = fields.map(f => f.id);
      let options = [];
      if (fieldIds.length > 0) {
        const [optRows] = await pool.query('SELECT * FROM form_field_options WHERE form_field_id IN (?) AND is_active = 1 ORDER BY sort_order ASC, id ASC', [fieldIds]);
        options = optRows;
      }
      
      const resultSections = [];
      for (const section of sections) {
        const sectionFields = fields.filter(f => f.form_section_id === section.id);
        if (sectionFields.length > 0) {
          resultSections.push({
            id: section.id,
            code: section.code,
            name: section.name,
            sortOrder: section.sort_order,
            fields: sectionFields.map(f => ({
              id: f.id,
              fieldCode: f.field_code,
              label: f.label,
              inputType: f.input_type,
              placeholder: f.placeholder,
              helpText: f.help_text,
              isRequired: !!f.is_required,
              scope: f.target_type,
              sortOrder: f.sort_order,
              options: options.filter(o => o.form_field_id === f.id).map(o => ({
                id: o.id,
                label: o.label,
                value: o.option_value,
                sortOrder: o.sort_order
              }))
            }))
          });
        }
      }
      
      res.json({ success: true, data: { institution: instRows[0], sections: resultSections } });
    } catch (err) { next(err); }
  }
}
module.exports = new FormConfigController();
