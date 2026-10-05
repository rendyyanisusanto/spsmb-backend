class GuardianRepository {
  async create(guardian, connection) {
    const [result] = await connection.query(
      `INSERT INTO applicant_guardians 
        (applicant_id, relationship, name) 
       VALUES (?, ?, ?)`,
      [
        guardian.applicant_id,
        guardian.relationship,
        guardian.name
      ]
    );
    return result.insertId;
  }
}

module.exports = new GuardianRepository();
