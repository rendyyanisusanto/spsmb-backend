const pool = require('../config/database');

class ApplicantDocumentRepository {
  async findByApplicationId(applicationId) {
    const [rows] = await pool.query(
      'SELECT * FROM applicant_documents WHERE application_id = ?',
      [applicationId]
    );
    return rows;
  }

  async findByApplicationAndDocType(applicationId, documentTypeId) {
    const [rows] = await pool.query(
      'SELECT * FROM applicant_documents WHERE application_id = ? AND document_type_id = ?',
      [applicationId, documentTypeId]
    );
    return rows[0] || null;
  }

  async create(data) {
    const [res] = await pool.query('INSERT INTO applicant_documents SET ?', [data]);
    return res.insertId;
  }

  async update(id, data) {
    await pool.query('UPDATE applicant_documents SET ? WHERE id = ?', [data, id]);
  }

  async remove(id) {
    await pool.query('DELETE FROM applicant_documents WHERE id = ?', [id]);
  }
}

module.exports = new ApplicantDocumentRepository();
