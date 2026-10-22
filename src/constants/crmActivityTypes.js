const CRM_ACTIVITY_TYPES = {
  NOTE: 'NOTE',
  CALL: 'CALL',
  WHATSAPP: 'WHATSAPP',
  CONSULTATION: 'CONSULTATION',
  STATUS_CHANGE: 'STATUS_CHANGE',
  SCHEDULE: 'SCHEDULE'
};

const CRM_ACTIVITY_TYPE_LABELS = {
  NOTE: 'Catatan Internal',
  CALL: 'Panggilan Telepon',
  WHATSAPP: 'WhatsApp Manual',
  CONSULTATION: 'Konsultasi / Tatap Muka',
  STATUS_CHANGE: 'Perubahan Status',
  SCHEDULE: 'Penjadwalan Follow-up'
};

const CRM_CONTACT_METHODS = {
  WHATSAPP: 'WHATSAPP',
  PHONE: 'PHONE',
  DIRECT: 'DIRECT',
  SYSTEM: 'SYSTEM'
};

const CRM_CONTACT_METHOD_LABELS = {
  WHATSAPP: 'WhatsApp',
  PHONE: 'Telepon Seluler',
  DIRECT: 'Tatap Muka / Langsung',
  SYSTEM: 'Sistem Otomatis'
};

const CRM_MESSAGE_STATUSES = {
  SENT: 'SENT',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
  DELIVERED: 'DELIVERED',
  QUEUED: 'QUEUED'
};

const CRM_MESSAGE_STATUS_LABELS = {
  SENT: 'Terkirim',
  FAILED: 'Gagal',
  UNKNOWN: 'Status Tidak Diketahui',
  DELIVERED: 'Tersampaikan',
  QUEUED: 'Dalam Antrean'
};

const getCrmActivityTypeOptions = () => {
  return Object.keys(CRM_ACTIVITY_TYPES).map(key => ({
    value: key,
    label: CRM_ACTIVITY_TYPE_LABELS[key] || key
  }));
};

module.exports = {
  CRM_ACTIVITY_TYPES,
  CRM_ACTIVITY_TYPE_LABELS,
  CRM_CONTACT_METHODS,
  CRM_CONTACT_METHOD_LABELS,
  CRM_MESSAGE_STATUSES,
  CRM_MESSAGE_STATUS_LABELS,
  getCrmActivityTypeOptions
};
