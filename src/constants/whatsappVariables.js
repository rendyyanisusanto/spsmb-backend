
const variablesMap = {
  INITIAL_REGISTRATION_SUCCESS: ['registration_number', 'student_name', 'parent_name', 'institution_name', 'registration_date'],
  FORM_INCOMPLETE: ['registration_number', 'student_name', 'parent_name', 'institution_name'],
  FULL_REGISTRATION_SUBMITTED: ['registration_number', 'student_name', 'parent_name', 'institution_name'],
  DOCUMENT_REVISION_REQUIRED: ['registration_number', 'student_name', 'parent_name', 'institution_name', 'document_name', 'revision_note'],
  DOCUMENTS_VERIFIED: ['registration_number', 'student_name', 'parent_name', 'institution_name'],
  APPLICATION_STATUS_CHANGED: ['registration_number', 'student_name', 'parent_name', 'institution_name', 'registration_status'],
  ANNOUNCEMENT: ['student_name', 'parent_name', 'institution_name', 'announcement_title', 'announcement_message']
};

const allVariables = [
  { key: 'registration_number', label: 'Nomor Pendaftaran' },
  { key: 'student_name', label: 'Nama Pendaftar' },
  { key: 'gender', label: 'Jenis Kelamin' },
  { key: 'parent_name', label: 'Nama Orang Tua/Wali' },
  { key: 'whatsapp', label: 'Nomor WhatsApp' },
  { key: 'previous_school', label: 'Asal Sekolah' },
  { key: 'institution_name', label: 'Nama Lembaga' },
  { key: 'registration_status', label: 'Status Pendaftaran' },
  { key: 'document_name', label: 'Nama Dokumen' },
  { key: 'revision_note', label: 'Catatan Perbaikan' },
  { key: 'announcement_title', label: 'Judul Pengumuman' },
  { key: 'announcement_message', label: 'Isi Pengumuman' },
  { key: 'registration_date', label: 'Tanggal Pendaftaran' }
];

module.exports = { variablesMap, allVariables };
