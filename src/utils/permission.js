const hasInstitutionAccess = (user, institutionId) => {
  if (!user) return false;
  if (user.primaryRole === 'SUPER_ADMIN' || user.globalAccess) return true;
  if (user.primaryRole === 'ADMIN_SPSMB') {
    if (!user.institutions) return false;
    return user.institutions.some(inst => inst.id === institutionId || inst.id === parseInt(institutionId));
  }
  // PETUGAS: will be determined in next sprint
  return false;
};

module.exports = {
  hasInstitutionAccess
};
