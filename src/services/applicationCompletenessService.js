const publicApplicationFormService = require('./publicApplicationFormService');
const formValidationService = require('./formValidationService');
const publicDocumentService = require('./publicDocumentService');

class ApplicationCompletenessService {
  async getCompleteness(application) {
    // 1. Form Completeness
    const formData = await publicApplicationFormService.getFormForApplication(application);
    const formCompletenessResult = formValidationService.calculateFormCompleteness(formData.sections);

    const missingFields = formCompletenessResult.missingRequiredFields.map(f => ({
      sectionId: f.sectionId,
      sectionName: formData.sections.find(s => s.id === f.sectionId)?.name || 'Unknown',
      fieldId: f.fieldId,
      label: f.label
    }));

    const formComplete = formCompletenessResult.complete;

    // 2. Document Completeness
    const documentData = await publicDocumentService.getDocuments(application);
    const docSummary = documentData.summary;
    const missingDocs = documentData.documents.filter(d => d.required && d.uploadStatus !== 'UPLOADED').map(d => ({
      documentTypeId: d.documentTypeId,
      code: d.code,
      name: d.name,
      required: d.required
    }));

    const docsComplete = docSummary.complete;

    const isComplete = formComplete && docsComplete;

    // Optional: Calculate Percentage
    // (Total Required Fields + Total Required Docs)
    let totalRequiredItems = 0;
    formData.sections.forEach(s => {
      s.fields.forEach(f => {
        if (f.isRequired) totalRequiredItems++;
      });
    });
    totalRequiredItems += docSummary.required;

    let completedRequiredItems = totalRequiredItems - (missingFields.length + missingDocs.length);
    let percentage = totalRequiredItems > 0 ? Math.round((completedRequiredItems / totalRequiredItems) * 100) : 100;

    if (application.status === 'SUBMITTED') {
      percentage = 100; // Always 100 if submitted
    }

    return {
      complete: isComplete,
      percentage,
      form: {
        complete: formComplete,
        missingCount: missingFields.length
      },
      documents: {
        complete: docsComplete,
        missingCount: missingDocs.length
      },
      missing: {
        fields: missingFields,
        documents: missingDocs
      }
    };
  }
}

module.exports = new ApplicationCompletenessService();
