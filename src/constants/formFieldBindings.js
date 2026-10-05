module.exports = {
  // CORE FIELD BINDINGS
  nik: { source: 'APPLICANT', column: 'nik' },
  nisn: { source: 'APPLICANT', column: 'nisn' },
  birth_place: { source: 'APPLICANT', column: 'birth_place' },
  birth_date: { source: 'APPLICANT', column: 'birth_date' },

  // GUARDIAN BINDINGS - FATHER
  father_name: { source: 'GUARDIAN', relationship: 'FATHER', column: 'name' },
  father_nik: { source: 'GUARDIAN', relationship: 'FATHER', column: 'nik' },
  father_phone: { source: 'GUARDIAN', relationship: 'FATHER', column: 'phone' },
  father_occupation: { source: 'GUARDIAN', relationship: 'FATHER', column: 'occupation' },
  father_education: { source: 'GUARDIAN', relationship: 'FATHER', column: 'education' },
  father_income: { source: 'GUARDIAN', relationship: 'FATHER', column: 'income' },
  father_address: { source: 'GUARDIAN', relationship: 'FATHER', column: 'address' },

  // GUARDIAN BINDINGS - MOTHER
  mother_name: { source: 'GUARDIAN', relationship: 'MOTHER', column: 'name' },
  mother_nik: { source: 'GUARDIAN', relationship: 'MOTHER', column: 'nik' },
  mother_phone: { source: 'GUARDIAN', relationship: 'MOTHER', column: 'phone' },
  mother_occupation: { source: 'GUARDIAN', relationship: 'MOTHER', column: 'occupation' },
  mother_education: { source: 'GUARDIAN', relationship: 'MOTHER', column: 'education' },
  mother_income: { source: 'GUARDIAN', relationship: 'MOTHER', column: 'income' },
  mother_address: { source: 'GUARDIAN', relationship: 'MOTHER', column: 'address' },

  // GUARDIAN BINDINGS - GUARDIAN
  guardian_name: { source: 'GUARDIAN', relationship: 'GUARDIAN', column: 'name' },
  guardian_nik: { source: 'GUARDIAN', relationship: 'GUARDIAN', column: 'nik' },
  guardian_phone: { source: 'GUARDIAN', relationship: 'GUARDIAN', column: 'phone' },
  guardian_occupation: { source: 'GUARDIAN', relationship: 'GUARDIAN', column: 'occupation' },
  guardian_education: { source: 'GUARDIAN', relationship: 'GUARDIAN', column: 'education' },
  guardian_income: { source: 'GUARDIAN', relationship: 'GUARDIAN', column: 'income' },
  guardian_address: { source: 'GUARDIAN', relationship: 'GUARDIAN', column: 'address' },

  // MAJOR CHOICE
  major_choice: { source: 'MAJOR_CHOICE' }
};
