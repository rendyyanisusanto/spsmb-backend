
const notificationTemplateService = require('./notificationTemplateService');

class WhatsappTemplateResolver {
  async resolveTemplate(eventCode, institutionId) {
    return notificationTemplateService.resolveTemplate(eventCode, institutionId ? [institutionId] : null);
  }
}
module.exports = new WhatsappTemplateResolver();
