const pool = require('../config/database');
const formFieldBindings = require('../constants/formFieldBindings');

class FormAnswerService {
  async getAnswersForApplication(applicationId, applicantId) {
    // 1. Fetch Dynamic Answers
    const [dynamicAnswers] = await pool.query(
      `SELECT form_field_id, answer_value FROM application_answers WHERE application_id = ?`,
      [applicationId]
    );

    // 2. Fetch Core Applicant Data
    const [applicants] = await pool.query(
      `SELECT * FROM applicants WHERE id = ?`,
      [applicantId]
    );
    const applicant = applicants[0] || {};

    // 3. Fetch Guardian Data
    const [guardians] = await pool.query(
      `SELECT * FROM applicant_guardians WHERE applicant_id = ?`,
      [applicantId]
    );

    // 4. Fetch Major Choice Data (if any)
    const [majors] = await pool.query(
      `SELECT major_id FROM application_major_choices WHERE application_id = ? AND priority = 1`,
      [applicationId]
    );
    const majorChoiceId = majors.length > 0 ? majors[0].major_id : null;

    // Helper to find guardian by relationship
    const getGuardian = (rel) => guardians.find(g => g.relationship === rel) || {};

    const valuesMap = {}; // key: fieldCode, value: actual value

    // Pre-fill based on bindings
    for (const [fieldCode, binding] of Object.entries(formFieldBindings)) {
      if (binding.source === 'APPLICANT') {
        valuesMap[fieldCode] = applicant[binding.column] !== undefined ? applicant[binding.column] : null;
      } else if (binding.source === 'GUARDIAN') {
        const guardian = getGuardian(binding.relationship);
        valuesMap[fieldCode] = guardian[binding.column] !== undefined ? guardian[binding.column] : null;
      } else if (binding.source === 'MAJOR_CHOICE') {
        valuesMap[fieldCode] = majorChoiceId;
      }
    }

    return { dynamicAnswers, valuesMap };
  }

  attachValuesToSections(sections, dynamicAnswers, valuesMap) {
    const dynamicAnswersMap = {};
    dynamicAnswers.forEach(ans => {
      let val = ans.answer_value;
      if (val !== null && val !== undefined) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            val = parsed;
          }
        } catch (e) {
          // not json array, keep as string
        }
      }
      dynamicAnswersMap[ans.form_field_id] = val;
    });

    sections.forEach(section => {
      section.fields.forEach(field => {
        const binding = formFieldBindings[field.fieldCode];
        if (binding) {
          // Core Field
          field.value = valuesMap[field.fieldCode];
          if (field.inputType === 'DATE' && field.value) {
            field.value = new Date(field.value).toISOString().split('T')[0];
          }
          field.binding = binding.source;
        } else {
          // Dynamic Field
          field.value = dynamicAnswersMap[field.id] !== undefined ? dynamicAnswersMap[field.id] : null;
          field.binding = 'DYNAMIC';
        }
      });
    });

    return sections;
  }
}

module.exports = new FormAnswerService();
