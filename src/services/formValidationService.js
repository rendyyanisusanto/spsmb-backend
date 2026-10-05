class FormValidationService {
  validateSection(section, answers, isCompleteAction) {
    const errors = {};
    const validAnswers = [];

    // Map answers by fieldId for easier lookup
    const answersMap = {};
    answers.forEach(ans => {
      answersMap[ans.fieldId] = ans.value;
    });

    section.fields.forEach(field => {
      let value = answersMap[field.id];
      const fieldErrors = [];

      // 1. Check required if action is complete
      if (isCompleteAction && field.isRequired) {
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
          fieldErrors.push(`${field.label} wajib diisi.`);
        }
      }

      // If value is not empty, validate type and options
      if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) {
        
        switch (field.inputType) {
          case 'NUMBER':
            if (isNaN(Number(value))) {
              fieldErrors.push(`${field.label} harus berupa angka.`);
            }
            break;
            
          case 'EMAIL':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
              fieldErrors.push(`${field.label} format email tidak valid.`);
            }
            break;
            
          case 'DATE':
            if (isNaN(Date.parse(value))) {
              fieldErrors.push(`${field.label} tanggal tidak valid.`);
            }
            break;

          case 'SELECT':
          case 'RADIO':
            const validOption = field.options.find(o => String(o.value) === String(value));
            if (!validOption) {
              fieldErrors.push(`${field.label} pilihan tidak valid.`);
            }
            break;
            
          case 'CHECKBOX':
            if (!Array.isArray(value)) {
              fieldErrors.push(`${field.label} harus berupa array.`);
            } else {
              const validOptionValues = field.options.map(o => String(o.value));
              const allValid = value.every(v => validOptionValues.includes(String(v)));
              if (!allValid) {
                fieldErrors.push(`${field.label} mengandung pilihan yang tidak valid.`);
              }
            }
            break;

          case 'TEXT':
          case 'TEXTAREA':
          case 'PHONE':
            if (typeof value !== 'string') {
               value = String(value);
            }
            break;
        }
      }

      if (fieldErrors.length > 0) {
        errors[field.id] = fieldErrors;
      } else if (value !== undefined) {
        // Prepare valid answers mapping to fields
        let processedValue = value;
        if (field.inputType === 'CHECKBOX') {
          processedValue = JSON.stringify(value);
        } else if (value !== null && value !== '') {
          processedValue = String(value);
        }
        
        validAnswers.push({
          field,
          value: processedValue === '' ? null : processedValue
        });
      }
    });

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      validAnswers
    };
  }

  calculateFormCompleteness(sections) {
    const missingRequiredFields = [];

    sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.isRequired) {
          const value = field.value;
          if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
            missingRequiredFields.push({
              fieldId: field.id,
              label: field.label,
              sectionId: section.id
            });
          }
        }
      });
    });

    return {
      complete: missingRequiredFields.length === 0,
      missingRequiredFields
    };
  }
}

module.exports = new FormValidationService();
