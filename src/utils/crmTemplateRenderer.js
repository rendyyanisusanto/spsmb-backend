/**
 * CRM WhatsApp Template Renderer & Variable Validator
 * Handles placeholder parsing, data injection, missing variable detection, and sanitization.
 */

const AVAILABLE_PLACEHOLDERS = [
  {
    key: 'nama',
    label: 'Nama Calon Peserta',
    description: 'Nama lengkap calon peserta didik',
    example: 'Ahmad Dani',
    aliases: ['nama', 'full_name', 'nama_lengkap', 'nama_siswa']
  },
  {
    key: 'sekolah_asal',
    label: 'Sekolah Asal',
    description: 'SMP / MTs asal calon peserta didik',
    example: 'SMP Negeri 1 Pakis',
    aliases: ['sekolah_asal', 'smp_asal', 'asal_sekolah']
  },
  {
    key: 'lembaga',
    label: 'Nama Lembaga',
    description: 'Nama lembaga pemilik lead (SMK, SMA, dsb)',
    example: 'SMK IT Asy-Syadzili',
    aliases: ['lembaga', 'nama_lembaga', 'institution_name']
  },
  {
    key: 'jurusan',
    label: 'Minat / Jurusan',
    description: 'Minat program studi atau kejuruan yang diminati',
    example: 'Teknik Komputer dan Jaringan',
    aliases: ['jurusan', 'minat', 'program', 'program_keahlian']
  },
  {
    key: 'nama_ayah',
    label: 'Nama Ayah',
    description: 'Nama ayah kandung calon peserta didik',
    example: 'Bpk. Subagyo',
    aliases: ['nama_ayah', 'ayah']
  },
  {
    key: 'nama_ibu',
    label: 'Nama Ibu',
    description: 'Nama ibu kandung calon peserta didik',
    example: 'Ibu Siti Aminah',
    aliases: ['nama_ibu', 'ibu']
  },
  {
    key: 'nomor_pendaftaran',
    label: 'Nomor Pendaftaran',
    description: 'Nomor registrasi SPSMB (jika sudah terdaftar)',
    example: 'REG-2026-00123',
    aliases: ['nomor_pendaftaran', 'no_pendaftaran', 'registration_number']
  },
  {
    key: 'link_pendaftaran',
    label: 'Link Pendaftaran',
    description: 'Tautan resmi formulir pendaftaran SPSMB',
    example: 'https://spsmb.asy-syadzili.sch.id/pendaftaran',
    aliases: ['link_pendaftaran', 'url_pendaftaran', 'link_spsmb']
  },
  {
    key: 'nama_petugas',
    label: 'Nama Petugas',
    description: 'Nama petugas pengirim pesan / penanggung jawab lead',
    example: 'Ustadz Farid',
    aliases: ['nama_petugas', 'petugas', 'officer_name']
  }
];

function getFrontendBaseUrl() {
  const envUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return envUrl.split(',')[0].trim().replace(/\/+$/, '');
}

/**
 * Returns the list of supported placeholders for UI documentation
 */
function getAvailablePlaceholders() {
  return AVAILABLE_PLACEHOLDERS;
}

/**
 * Build dictionary of values from lead and current user
 */
function buildDataMap(lead = {}, currentUser = null, customOverrides = {}) {
  const frontendUrl = getFrontendBaseUrl();
  const registrationLink = `${frontendUrl}/pendaftaran`;

  const leadName = lead.full_name || lead.fullName || '';
  const schoolOrigin = lead.school_origin || lead.schoolOrigin || '';
  const institutionName = lead.institution_name || lead.institution?.name || '';
  const interest = lead.interest || '';
  const fatherName = lead.father_name || lead.fatherName || '';
  const motherName = lead.mother_name || lead.motherName || '';
  const regNumber = lead.application_registration_number || lead.application?.registrationNumber || '';
  const officerName = currentUser?.name || lead.lead_by_name || lead.leadBy?.name || 'Panitia SPSMB';

  const map = {
    nama: leadName,
    sekolah_asal: schoolOrigin,
    lembaga: institutionName,
    jurusan: interest,
    nama_ayah: fatherName,
    nama_ibu: motherName,
    nomor_pendaftaran: regNumber,
    link_pendaftaran: registrationLink,
    nama_petugas: officerName,
    ...customOverrides
  };

  return map;
}

/**
 * Render template text with lead data and analyze missing variables
 * @param {string} templateText 
 * @param {object} lead 
 * @param {object} currentUser 
 * @param {object} options 
 * @returns {{ text: string, usedVariables: string[], missingVariables: string[], isValid: boolean }}
 */
function renderTemplate(templateText, lead = {}, currentUser = null, options = {}) {
  if (!templateText || typeof templateText !== 'string') {
    return {
      text: '',
      usedVariables: [],
      missingVariables: [],
      isValid: true
    };
  }

  const dataMap = buildDataMap(lead, currentUser, options.overrides || {});
  const usedVariables = new Set();
  const missingVariables = new Set();

  let rendered = templateText;

  // Scan all supported placeholders and aliases
  for (const item of AVAILABLE_PLACEHOLDERS) {
    for (const alias of item.aliases) {
      const regex = new RegExp(`\\{\\{\\s*${alias}\\s*\\}\\}`, 'gi');
      if (regex.test(rendered)) {
        usedVariables.add(item.key);
        const val = dataMap[item.key];

        if (val !== undefined && val !== null && String(val).trim() !== '') {
          rendered = rendered.replace(regex, String(val).trim());
        } else {
          missingVariables.add(item.key);
          if (options.keepMissingPlaceholders) {
            // Keep unchanged
          } else if (options.fillEmptyWithBlank) {
            rendered = rendered.replace(regex, '');
          }
        }
      }
    }
  }

  // Also catch any unknown {{something}}
  const unknownMatches = rendered.match(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g);
  if (unknownMatches) {
    for (const match of unknownMatches) {
      const key = match.replace(/[{}]/g, '').trim();
      usedVariables.add(key);
      missingVariables.add(key);
    }
  }

  return {
    text: rendered.trim(),
    usedVariables: Array.from(usedVariables),
    missingVariables: Array.from(missingVariables),
    isValid: missingVariables.size === 0
  };
}

/**
 * Generate a preview with realistic dummy data for template builder testing
 */
function renderSamplePreview(templateText) {
  const sampleLead = {
    fullName: 'Ahmad Dani Saputra',
    schoolOrigin: 'SMP Negeri 1 Pakis',
    institution: {
      name: 'SMK IT Asy-Syadzili',
      code: 'SMK'
    },
    interest: 'Teknik Komputer & Jaringan',
    fatherName: 'Bpk. Subagyo',
    motherName: 'Ibu Siti Aminah',
    application: {
      registrationNumber: 'REG-2026-0089'
    }
  };

  const sampleUser = {
    name: 'Ustadz M. Syamsul Arifin'
  };

  return renderTemplate(templateText, sampleLead, sampleUser, { keepMissingPlaceholders: false });
}

module.exports = {
  AVAILABLE_PLACEHOLDERS,
  getAvailablePlaceholders,
  renderTemplate,
  renderSamplePreview,
  buildDataMap
};
