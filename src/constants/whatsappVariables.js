
const variablesMap = {
  REGISTRATION_CREATED: ['registration_number', 'student_name', 'gender', 'registration_type', 'institution_name', 'pondok_name', 'continue_url', 'receipt_url', 'parent_name', 'whatsapp', 'previous_school', 'registration_date'],
  REGISTRATION_SUBMITTED: ['registration_number', 'student_name', 'gender', 'registration_type', 'institution_name', 'pondok_name', 'continue_url', 'receipt_url', 'parent_name', 'whatsapp', 'previous_school', 'registration_date'],
  INITIAL_REGISTRATION_SUCCESS: ['registration_number', 'student_name', 'gender', 'registration_type', 'institution_name', 'pondok_name', 'continue_url', 'receipt_url', 'parent_name', 'whatsapp', 'previous_school', 'registration_date'],
  FULL_REGISTRATION_SUBMITTED: ['registration_number', 'student_name', 'gender', 'registration_type', 'institution_name', 'pondok_name', 'continue_url', 'receipt_url', 'parent_name', 'whatsapp', 'previous_school', 'registration_date'],
  FORM_INCOMPLETE: ['registration_number', 'student_name', 'parent_name', 'institution_name', 'continue_url'],
  DOCUMENT_REVISION_REQUIRED: ['registration_number', 'student_name', 'parent_name', 'institution_name', 'document_name', 'revision_note'],
  DOCUMENTS_VERIFIED: ['registration_number', 'student_name', 'parent_name', 'institution_name'],
  APPLICATION_STATUS_CHANGED: ['registration_number', 'student_name', 'parent_name', 'institution_name', 'registration_status'],
  ANNOUNCEMENT: ['student_name', 'parent_name', 'institution_name', 'announcement_title', 'announcement_message']
};

const allVariables = [
  { key: 'student_name', label: 'Nama Pendaftar' },
  { key: 'registration_number', label: 'Nomor Pendaftaran' },
  { key: 'registration_type', label: 'Jalur / Jenis Pendaftaran' },
  { key: 'gender', label: 'Jenis Kelamin' },
  { key: 'institution_name', label: 'Nama Lembaga Formal' },
  { key: 'pondok_name', label: 'Nama Pondok Pesantren' },
  { key: 'continue_url', label: 'Tautan Lanjut Pendaftaran' },
  { key: 'receipt_url', label: 'Tautan Bukti / Struk Pendaftaran' },
  { key: 'parent_name', label: 'Nama Orang Tua/Wali' },
  { key: 'whatsapp', label: 'Nomor WhatsApp' },
  { key: 'previous_school', label: 'Asal Sekolah' },
  { key: 'registration_status', label: 'Status Pendaftaran' },
  { key: 'document_name', label: 'Nama Dokumen' },
  { key: 'revision_note', label: 'Catatan Perbaikan' },
  { key: 'announcement_title', label: 'Judul Pengumuman' },
  { key: 'announcement_message', label: 'Isi Pengumuman' },
  { key: 'registration_date', label: 'Tanggal Pendaftaran' }
];

module.exports = { variablesMap, allVariables };
