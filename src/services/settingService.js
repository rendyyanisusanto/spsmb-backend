const settingRepository = require('../repositories/settingRepository');
const pool = require('../config/database');

const parseValue = (value, type) => {
  if (value === null) return null;
  if (type === 'boolean') return value === 'true';
  if (type === 'number') return Number(value);
  return value;
};

const stringifyValue = (value) => {
  if (value === null || value === undefined) return null;
  return String(value);
};

const mapSettingsToData = (settingsRows) => {
  const dict = {};
  for (const r of settingsRows) {
    dict[r.setting_key] = parseValue(r.setting_value, r.setting_type);
  }

  return {
    general: {
      systemName: dict['general.systemName'] || 'SPSMB Terpadu',
      registrationName: dict['general.registrationName'] || 'Seleksi Penerimaan Santri dan Murid Baru',
      academicYear: dict['general.academicYear'] || '2027/2028'
    },
    registration: {
      enabled: dict['registration.enabled'] !== undefined ? dict['registration.enabled'] : true,
      allowEditAfterSubmit: dict['registration.allowEditAfterSubmit'] || false,
      prefix: dict['registration.prefix'] || 'SPSMB',
      defaultPeriodId: dict['registration.defaultPeriodId'] || null,
      defaultWaveId: dict['registration.defaultWaveId'] || null
    },
    contact: {
      whatsapp: dict['contact.whatsapp'] || '',
      email: dict['contact.email'] || '',
      address: dict['contact.address'] || '',
      serviceHours: dict['contact.serviceHours'] || ''
    },
    whatsapp: {
      enabled: dict['whatsapp.enabled'] !== undefined ? dict['whatsapp.enabled'] : false,
      adminNumber: dict['whatsapp.adminNumber'] || ''
    },
    appearance: {
      showLogo: dict['appearance.showLogo'] !== undefined ? dict['appearance.showLogo'] : true,
      showAcademicYear: dict['appearance.showAcademicYear'] !== undefined ? dict['appearance.showAcademicYear'] : true,
      headerTitle: dict['appearance.headerTitle'] || '',
      headerSubtitle: dict['appearance.headerSubtitle'] || '',
      footerMessage: dict['appearance.footerMessage'] || ''
    }
  };
};

const getSettings = async () => {
  const rows = await settingRepository.findAll();
  return mapSettingsToData(rows);
};

const getPublicSettings = async () => {
  const all = await getSettings();
  return {
    general: all.general,
    registrationEnabled: all.registration.enabled,
    contact: all.contact,
    appearance: all.appearance
  };
};

const updateSettings = async (data) => {
  if (!data.general?.systemName || !data.general?.registrationName || !data.general?.academicYear || !data.registration?.prefix) {
    throw new Error('systemName, registrationName, academicYear, dan prefix wajib diisi.');
  }

  const updates = [];
  
  const addUpdate = (key, val, type) => {
    updates.push({ key, value: stringifyValue(val), type });
  };

  if (data.general) {
    addUpdate('general.systemName', data.general.systemName, 'string');
    addUpdate('general.registrationName', data.general.registrationName, 'string');
    addUpdate('general.academicYear', data.general.academicYear, 'string');
  }
  if (data.registration) {
    addUpdate('registration.enabled', data.registration.enabled, 'boolean');
    addUpdate('registration.allowEditAfterSubmit', data.registration.allowEditAfterSubmit, 'boolean');
    addUpdate('registration.prefix', data.registration.prefix, 'string');
    addUpdate('registration.defaultPeriodId', data.registration.defaultPeriodId, 'number');
    addUpdate('registration.defaultWaveId', data.registration.defaultWaveId, 'number');
  }
  if (data.contact) {
    addUpdate('contact.whatsapp', data.contact.whatsapp, 'string');
    addUpdate('contact.email', data.contact.email, 'string');
    addUpdate('contact.address', data.contact.address, 'string');
    addUpdate('contact.serviceHours', data.contact.serviceHours, 'string');
  }
  if (data.whatsapp) {
    addUpdate('whatsapp.enabled', data.whatsapp.enabled, 'boolean');
    addUpdate('whatsapp.adminNumber', data.whatsapp.adminNumber, 'string');
  }
  if (data.appearance) {
    addUpdate('appearance.showLogo', data.appearance.showLogo, 'boolean');
    addUpdate('appearance.showAcademicYear', data.appearance.showAcademicYear, 'boolean');
    addUpdate('appearance.headerTitle', data.appearance.headerTitle, 'string');
    addUpdate('appearance.headerSubtitle', data.appearance.headerSubtitle, 'string');
    addUpdate('appearance.footerMessage', data.appearance.footerMessage, 'string');
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await settingRepository.saveAll(connection, updates);
    await connection.commit();
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) connection.release();
  }

  return await getSettings();
};

module.exports = {
  getSettings,
  getPublicSettings,
  updateSettings
};
