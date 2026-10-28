const CRM_SCHOOL_STATUS = {
  LEADS: 'LEADS',
  FOLLOWED_UP: 'FOLLOWED_UP',
  REJECTED: 'REJECTED',
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED'
};

const CRM_SCHOOL_STATUS_LABELS = {
  [CRM_SCHOOL_STATUS.LEADS]: 'Leads',
  [CRM_SCHOOL_STATUS.FOLLOWED_UP]: 'Sudah di-follow up',
  [CRM_SCHOOL_STATUS.REJECTED]: 'Ditolak',
  [CRM_SCHOOL_STATUS.SCHEDULED]: 'Dijadwalkan',
  [CRM_SCHOOL_STATUS.COMPLETED]: 'Selesai'
};

const CRM_SCHOOL_STATUS_DESCRIPTIONS = {
  [CRM_SCHOOL_STATUS.LEADS]: 'Sekolah sasaran baru dicatat ke dalam database target',
  [CRM_SCHOOL_STATUS.FOLLOWED_UP]: 'Sudah dilakukan komunikasi awal / tindak lanjut dengan pihak sekolah',
  [CRM_SCHOOL_STATUS.REJECTED]: 'Sekolah menolak permohonan presentasi atau belum bersedia menerima kunjungan',
  [CRM_SCHOOL_STATUS.SCHEDULED]: 'Jadwal dan lokasi presentasi sosialisasi SPMB telah disepakati',
  [CRM_SCHOOL_STATUS.COMPLETED]: 'Sosialisasi / presentasi telah selesai dilaksanakan dan laporan terverifikasi'
};

const getSchoolStatusOptions = () => {
  return Object.values(CRM_SCHOOL_STATUS).map(key => ({
    value: key,
    label: CRM_SCHOOL_STATUS_LABELS[key],
    description: CRM_SCHOOL_STATUS_DESCRIPTIONS[key]
  }));
};

module.exports = {
  CRM_SCHOOL_STATUS,
  CRM_SCHOOL_STATUS_LABELS,
  CRM_SCHOOL_STATUS_DESCRIPTIONS,
  getSchoolStatusOptions
};
