
const academicYearRepository = require('../repositories/academicYearRepository');
const pool = require('../config/database');

class AcademicYearService {
  async getAll(query) {
    const limit = parseInt(query.limit) || 10;
    const page = parseInt(query.page) || 1;
    const offset = (page - 1) * limit;
    
    const result = await academicYearRepository.findAll({
      search: query.search,
      status: query.status,
      limit,
      offset
    });
    
    return {
      data: result.rows.map(this.format),
      meta: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    };
  }

  async getById(id) {
    const row = await academicYearRepository.findById(id);
    if (!row) throw { status: 404, message: 'Tahun ajaran tidak ditemukan' };
    return this.format(row);
  }

  async create(data) {
    if (!data.name || !data.startYear || !data.endYear) {
      throw { status: 422, message: 'Data tidak lengkap' };
    }
    if (data.startYear >= data.endYear) {
      throw { status: 422, message: 'Tahun akhir harus lebih besar dari tahun awal' };
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (data.isActive) {
        await connection.query('UPDATE academic_years SET is_active = 0');
      }
      const [res] = await connection.query('INSERT INTO academic_years SET ?', [{
        name: data.name,
        start_year: data.startYear,
        end_year: data.endYear,
        is_active: data.isActive ? 1 : 0
      }]);
      await connection.commit();
      return this.format(await academicYearRepository.findById(res.insertId));
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async update(id, data) {
    const existing = await academicYearRepository.findById(id);
    if (!existing) throw { status: 404, message: 'Tahun ajaran tidak ditemukan' };

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.startYear !== undefined) updateData.start_year = data.startYear;
    if (data.endYear !== undefined) updateData.end_year = data.endYear;
    
    if (updateData.start_year && updateData.end_year && updateData.start_year >= updateData.end_year) {
      throw { status: 422, message: 'Tahun akhir harus lebih besar dari tahun awal' };
    }

    if (Object.keys(updateData).length > 0) {
      await academicYearRepository.update(id, updateData);
    }
    return this.format(await academicYearRepository.findById(id));
  }

  async updateStatus(id, isActive) {
    const existing = await academicYearRepository.findById(id);
    if (!existing) throw { status: 404, message: 'Tahun ajaran tidak ditemukan' };
    
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (isActive) {
        await connection.query('UPDATE academic_years SET is_active = 0');
      }
      await connection.query('UPDATE academic_years SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
      await connection.commit();
      return this.format(await academicYearRepository.findById(id));
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  format(row) {
    return {
      id: row.id,
      name: row.name,
      startYear: row.start_year,
      endYear: row.end_year,
      isActive: !!row.is_active
    };
  }
}
module.exports = new AcademicYearService();
