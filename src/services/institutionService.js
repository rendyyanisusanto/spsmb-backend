const institutionRepository = require('../repositories/institutionRepository');
const { hasInstitutionAccess } = require('../utils/permission');

const getInstitutions = async (user, params = {}) => {
  if (user.primaryRole === 'ADMIN_SPSMB') {
    params.allowedInstitutionIds = user.institutions ? user.institutions.map(i => i.id) : [];
  } else if (user.primaryRole !== 'SUPER_ADMIN') {
    return []; // No access for PETUGAS or others yet
  }
  return await institutionRepository.findInstitutions(params);
};

const getPublicInstitutions = async () => {
  return await institutionRepository.findInstitutions({ status: 'ACTIVE' });
};

const getInstitutionById = async (user, id) => {
  if (user.primaryRole !== 'SUPER_ADMIN' && !hasInstitutionAccess(user, id)) {
    throw new Error('FORBIDDEN');
  }
  const inst = await institutionRepository.findById(id);
  if (!inst) throw new Error('NOT_FOUND');
  return inst;
};

const createInstitution = async (user, data) => {
  if (user.primaryRole !== 'SUPER_ADMIN') throw new Error('FORBIDDEN');
  
  if (!data.name || !data.institution_type || !data.code) {
    throw new Error('Name, code, dan type wajib diisi.');
  }

  const existing = await institutionRepository.findByCode(data.code);
  if (existing) throw new Error('Kode lembaga sudah digunakan.');

  const id = await institutionRepository.createInstitution(data);
  return await institutionRepository.findById(id);
};

const updateInstitution = async (user, id, data) => {
  if (user.primaryRole !== 'SUPER_ADMIN' && !hasInstitutionAccess(user, id)) {
    throw new Error('FORBIDDEN');
  }
  
  const existing = await institutionRepository.findById(id);
  if (!existing) throw new Error('NOT_FOUND');

  // If Admin SPSMB, they cannot change type or code
  let updateData = { ...data };
  if (user.primaryRole === 'ADMIN_SPSMB') {
    updateData.institution_type = existing.institution_type;
    updateData.code = existing.code;
  } else {
    if (data.code && data.code !== existing.code) {
      const checkCode = await institutionRepository.findByCode(data.code);
      if (checkCode) throw new Error('Kode lembaga sudah digunakan.');
    }
  }

  await institutionRepository.updateInstitution(id, {
    code: updateData.code || existing.code,
    name: updateData.name || existing.name,
    institution_type: updateData.institution_type || existing.institution_type,
    gender_scope: updateData.gender_scope || existing.gender_scope
  });

  return await institutionRepository.findById(id);
};

const updateStatus = async (user, id, isActive) => {
  if (user.primaryRole !== 'SUPER_ADMIN') throw new Error('FORBIDDEN');
  
  const existing = await institutionRepository.findById(id);
  if (!existing) throw new Error('NOT_FOUND');

  await institutionRepository.updateStatus(id, isActive);
  return { success: true };
};

module.exports = {
  getInstitutions,
  getPublicInstitutions,
  getInstitutionById,
  createInstitution,
  updateInstitution,
  updateStatus
};
