
const { variablesMap, allVariables } = require('../constants/whatsappVariables');

const extractVariables = (message) => {
  if (!message) return [];
  const regex = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;
  let match;
  const vars = [];
  while ((match = regex.exec(message)) !== null) {
    vars.push(match[1]);
  }
  return [...new Set(vars)];
};

const validateVariables = (message, eventCode) => {
  const extracted = extractVariables(message);
  const allowed = variablesMap[eventCode] || [];
  
  // Allow all variables just in case, but strict validation is better.
  // We'll use allVariables for global validation.
  const allKeys = allVariables.map(v => v.key);
  
  const invalid = [];
  for (const v of extracted) {
    if (!allKeys.includes(v)) {
      invalid.push(v);
    }
  }
  
  if (invalid.length > 0) {
    return {
      isValid: false,
      errors: invalid.map(v => `Variable {{${v}}} tidak tersedia.`)
    };
  }
  return { isValid: true };
};

const renderTemplate = (message, data) => {
  if (!message) return '';
  return message.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (match, key) => {
    return data[key] !== undefined && data[key] !== null ? data[key] : '';
  });
};

module.exports = { extractVariables, validateVariables, renderTemplate };
