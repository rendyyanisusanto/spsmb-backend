const CRM_LEAD_STATUS = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  INTERESTED: 'INTERESTED',
  FOLLOW_UP: 'FOLLOW_UP',
  READY_TO_REGISTER: 'READY_TO_REGISTER',
  CONVERTED: 'CONVERTED',
  NOT_INTERESTED: 'NOT_INTERESTED'
};

const CRM_LEAD_STATUS_LABELS = {
  [CRM_LEAD_STATUS.NEW]: 'Lead Baru',
  [CRM_LEAD_STATUS.CONTACTED]: 'Sudah Dihubungi',
  [CRM_LEAD_STATUS.INTERESTED]: 'Tertarik',
  [CRM_LEAD_STATUS.FOLLOW_UP]: 'Perlu Follow-up',
  [CRM_LEAD_STATUS.READY_TO_REGISTER]: 'Siap Mendaftar',
  [CRM_LEAD_STATUS.CONVERTED]: 'Berhasil Dikonversi',
  [CRM_LEAD_STATUS.NOT_INTERESTED]: 'Tidak Berminat'
};

const CRM_LEAD_STATUS_DESCRIPTIONS = {
  [CRM_LEAD_STATUS.NEW]: 'Lead baru dicatat',
  [CRM_LEAD_STATUS.CONTACTED]: 'Lead sudah dihubungi',
  [CRM_LEAD_STATUS.INTERESTED]: 'Calon peserta menunjukkan ketertarikan',
  [CRM_LEAD_STATUS.FOLLOW_UP]: 'Perlu tindak lanjut',
  [CRM_LEAD_STATUS.READY_TO_REGISTER]: 'Calon peserta siap diarahkan mendaftar',
  [CRM_LEAD_STATUS.CONVERTED]: 'Lead sudah terhubung dengan proses pendaftaran sesuai aturan aplikasi',
  [CRM_LEAD_STATUS.NOT_INTERESTED]: 'Calon peserta tidak berminat'
};

const getStatusOptions = () => {
  return Object.values(CRM_LEAD_STATUS).map(key => ({
    value: key,
    label: CRM_LEAD_STATUS_LABELS[key],
    description: CRM_LEAD_STATUS_DESCRIPTIONS[key]
  }));
};

module.exports = {
  CRM_LEAD_STATUS,
  CRM_LEAD_STATUS_LABELS,
  CRM_LEAD_STATUS_DESCRIPTIONS,
  getStatusOptions
};
