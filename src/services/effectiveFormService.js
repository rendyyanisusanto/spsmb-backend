const pool = require('../config/database');

class EffectiveFormService {
  async getEffectiveForm(application) {
    const targets = [];
    targets.push({ type: 'COMMON', institutionId: null });
    targets.push({ type: 'PONDOK_COMMON', institutionId: null });

    if (application.pondok_institution_id) {
      targets.push({ type: 'INSTITUTION', institutionId: application.pondok_institution_id });
    }

    if (['SMP', 'SMA', 'SMK'].includes(application.registration_type) && application.formal_institution_id) {
      targets.push({ type: 'INSTITUTION', institutionId: application.formal_institution_id });
    }

    // Resolve target IDs
    let targetConditions = targets.map(t => {
      if (t.institutionId) {
        return `(target_type = '${t.type}' AND institution_id = ${t.institutionId})`;
      } else {
        return `(target_type = '${t.type}' AND institution_id IS NULL)`;
      }
    }).join(' OR ');

    const [formTargets] = await pool.query(
      `SELECT id FROM form_targets WHERE is_active = 1 AND (${targetConditions})`
    );

    if (formTargets.length === 0) return [];
    
    const targetIds = formTargets.map(t => t.id);

    // Fetch active sections
    const [sections] = await pool.query(
      `SELECT id, code, name, sort_order FROM form_sections WHERE is_active = 1 ORDER BY sort_order ASC`
    );

    // Fetch active fields for these targets
    const [fields] = await pool.query(
      `SELECT f.*, t.target_type as scope 
       FROM form_fields f
       JOIN form_targets t ON f.form_target_id = t.id
       WHERE f.is_active = 1 AND f.form_target_id IN (?)
       ORDER BY f.sort_order ASC`,
      [targetIds]
    );

    if (fields.length === 0) return [];

    const fieldIds = fields.map(f => f.id);

    // Fetch active options for these fields
    const [options] = await pool.query(
      `SELECT id, form_field_id, label, option_value, sort_order 
       FROM form_field_options 
       WHERE is_active = 1 AND form_field_id IN (?)
       ORDER BY sort_order ASC`,
      [fieldIds]
    );

    // Detect duplicate field_code collision (specifically for CORE fields that shouldn't be duplicated)
    // Actually we just group fields by section
    const effectiveSections = [];

    sections.forEach(section => {
      const sectionFields = fields.filter(f => f.form_section_id === section.id);
      
      if (sectionFields.length > 0) {
        const formattedFields = sectionFields.map(f => {
          const fieldOptions = options
            .filter(o => o.form_field_id === f.id)
            .map(o => ({
              id: o.id,
              label: o.label,
              value: o.option_value
            }));

          return {
            id: f.id,
            fieldCode: f.field_code,
            label: f.label,
            inputType: f.input_type,
            placeholder: f.placeholder,
            helpText: f.help_text,
            isRequired: !!f.is_required,
            sortOrder: f.sort_order,
            scope: f.scope,
            options: fieldOptions
          };
        });

        effectiveSections.push({
          id: section.id,
          code: section.code,
          name: section.name,
          sortOrder: section.sort_order,
          fields: formattedFields
        });
      }
    });

    // Sort fields inside sections, then sections themselves
    effectiveSections.forEach(s => {
      s.fields.sort((a, b) => a.sortOrder - b.sortOrder);
    });
    effectiveSections.sort((a, b) => a.sortOrder - b.sortOrder);

    return effectiveSections;
  }
}

module.exports = new EffectiveFormService();
