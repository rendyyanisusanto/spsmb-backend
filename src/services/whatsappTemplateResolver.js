
const repo = require('../repositories/whatsappTemplateRepository');

class WhatsappTemplateResolver {
  async resolveTemplate(eventCode, institutionId) {
    if (institutionId) {
      const override = await repo.getActiveTemplate(eventCode, 'INSTITUTION', institutionId);
      if (override) {
        return { template: override, resolvedScope: 'INSTITUTION' };
      }
    }
    const globalTemplate = await repo.getActiveTemplate(eventCode, 'GLOBAL');
    if (globalTemplate) {
      return { template: globalTemplate, resolvedScope: 'GLOBAL' };
    }
    return null;
  }
}
module.exports = new WhatsappTemplateResolver();
