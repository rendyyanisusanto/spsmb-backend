class ApplicantRepository {
  async create(applicant, connection) {
    const [result] = await connection.query(
      `INSERT INTO applicants 
        (full_name, gender, whatsapp, address, previous_school, information_source_id, information_source_other, birth_place, birth_date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        applicant.full_name,
        applicant.gender,
        applicant.whatsapp,
        applicant.address,
        applicant.previous_school,
        applicant.information_source_id,
        applicant.information_source_other,
        applicant.birth_place,
        applicant.birth_date
      ]
    );
    return result.insertId;
  }
}

module.exports = new ApplicantRepository();
