const CRM_TEMPLATE_CATEGORIES = {
  INTRO: 'INTRO',
  MAJOR_INFO: 'MAJOR_INFO',
  FEE_INFO: 'FEE_INFO',
  CONSULTATION: 'CONSULTATION',
  FOLLOW_UP_REMINDER: 'FOLLOW_UP_REMINDER',
  REGISTRATION_INFO: 'REGISTRATION_INFO',
  OTHER: 'OTHER'
};

const CRM_TEMPLATE_CATEGORY_LABELS = {
  INTRO: 'Perkenalan Lembaga',
  MAJOR_INFO: 'Informasi Jurusan & Program',
  FEE_INFO: 'Informasi Biaya & Program',
  CONSULTATION: 'Undangan Konsultasi & Kunjungan',
  FOLLOW_UP_REMINDER: 'Pengingat Follow-up',
  REGISTRATION_INFO: 'Informasi Pendaftaran',
  OTHER: 'Pesan Khusus Lainnya'
};

const getCrmTemplateCategoryOptions = () => {
  return Object.keys(CRM_TEMPLATE_CATEGORIES).map(key => ({
    value: key,
    label: CRM_TEMPLATE_CATEGORY_LABELS[key] || key
  }));
};

module.exports = {
  CRM_TEMPLATE_CATEGORIES,
  CRM_TEMPLATE_CATEGORY_LABELS,
  getCrmTemplateCategoryOptions
};
