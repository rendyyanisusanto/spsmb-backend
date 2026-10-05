
const periodRepo = require('../repositories/registrationPeriodRepository');
const academicYearRepo = require('../repositories/academicYearRepository');
const pool = require('../config/database');

class RegistrationPeriodService {
  async getAll(query) {
    const limit = parseInt(query.limit) || 10;
    const page = parseInt(query.page) || 1;
    const offset = (page - 1) * limit;
    
    const result = await periodRepo.findAll({
      search: query.search,
      status: query.status,
      limit,
      offset
    });
    
    return {
      data: result.rows.map(this.format),
      meta: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) }
    };
  }

  async getById(id) {
    const row = await periodRepo.findById(id);
    if (!row) throw { status: 404, message: 'Periode tidak ditemukan' };
    return this.format(row);
  }

  async create(data) {
    if (!data.name || !data.academicYearId || !data.startDate || !data.endDate) {
      throw { status: 422, message: 'Data tidak lengkap' };
    }
    if (new Date(data.endDate) < new Date(data.startDate)) {
      throw { status: 422, message: 'Tanggal akhir tidak boleh lebih kecil dari tanggal mulai' };
    }
    const acYear = await academicYearRepo.findById(data.academicYearId);
    if (!acYear) throw { status: 422, message: 'Tahun ajaran tidak valid' };

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (data.isActive) {
        await connection.query('UPDATE admission_periods SET is_active = 0');
      }
      const [res] = await connection.query('INSERT INTO admission_periods SET ?', [{
        name: data.name,
        academic_year: data.academicYearId,
        start_date: data.startDate,
        end_date: data.endDate,
        is_active: data.isActive ? 1 : 0
      }]);
      await connection.commit();
      return this.format(await periodRepo.findById(res.insertId));
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async update(id, data) {
    const existing = await periodRepo.findById(id);
    if (!existing) throw { status: 404, message: 'Periode tidak ditemukan' };

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.academicYearId !== undefined) {
      const acYear = await academicYearRepo.findById(data.academicYearId);
      if (!acYear) throw { status: 422, message: 'Tahun ajaran tidak valid' };
      updateData.academic_year = data.academicYearId;
    }
    if (data.startDate !== undefined) updateData.start_date = data.startDate;
    if (data.endDate !== undefined) updateData.end_date = data.endDate;
    
    const start = updateData.start_date || existing.start_date;
    const end = updateData.end_date || existing.end_date;
    if (new Date(end) < new Date(start)) {
      throw { status: 422, message: 'Tanggal akhir tidak boleh lebih kecil dari tanggal mulai' };
    }

    if (Object.keys(updateData).length > 0) {
      await pool.query('UPDATE admission_periods SET ? WHERE id = ?', [updateData, id]);
    }
    return this.format(await periodRepo.findById(id));
  }

  async updateStatus(id, isActive) {
    const existing = await periodRepo.findById(id);
    if (!existing) throw { status: 404, message: 'Periode tidak ditemukan' };
    
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (isActive) {
        await connection.query('UPDATE admission_periods SET is_active = 0');
      }
      await connection.query('UPDATE admission_periods SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
      await connection.commit();
      return this.format(await periodRepo.findById(id));
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  format(row) {
    const sDate = row.start_date ? new Date(row.start_date) : null;
    const eDate = row.end_date ? new Date(row.end_date) : null;
    // ensure offset issues don't affect ISO strings dates visually by using local format
    const sStr = sDate ? sDate.getFullYear()+'-'+String(sDate.getMonth()+1).padStart(2, '0')+'-'+String(sDate.getDate()).padStart(2, '0') : null;
    const eStr = eDate ? eDate.getFullYear()+'-'+String(eDate.getMonth()+1).padStart(2, '0')+'-'+String(eDate.getDate()).padStart(2, '0') : null;
    
    return {
      id: row.id,
      name: row.name,
      academicYear: {
        id: parseInt(row.academic_year_id) || parseInt(row.academic_year),
        name: row.academic_year_name || row.academic_year
      },
      startDate: sStr,
      endDate: eStr,
      isActive: !!row.is_active
    };
  }
}
module.exports = new RegistrationPeriodService();
