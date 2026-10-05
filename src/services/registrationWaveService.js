
const pool = require('../config/database');
const periodRepo = require('../repositories/registrationPeriodRepository');

class RegistrationWaveService {
  async getAll(query) {
    const limit = parseInt(query.limit) || 10;
    const page = parseInt(query.page) || 1;
    const offset = (page - 1) * limit;
    
    let q = 'SELECT w.*, p.name as period_name FROM admission_waves w LEFT JOIN admission_periods p ON w.admission_period_id = p.id WHERE 1=1';
    const params = [];
    if (query.periodId) {
      q += ' AND w.admission_period_id = ?';
      params.push(query.periodId);
    }
    if (query.status) {
      q += ' AND w.is_active = ?';
      params.push(query.status === 'ACTIVE' ? 1 : 0);
    }
    if (query.search) {
      q += ' AND w.name LIKE ?';
      params.push('%' + query.search + '%');
    }
    
    let countQuery = q.replace('SELECT w.*, p.name as period_name', 'SELECT COUNT(*) as total');
    
    q += ' ORDER BY w.id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const [rows] = await pool.query(q, params);
    const [[{ total }]] = await pool.query(countQuery, params.slice(0, -2));
    
    return {
      data: rows.map(this.format),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  async getById(id) {
    const [rows] = await pool.query('SELECT w.*, p.name as period_name FROM admission_waves w LEFT JOIN admission_periods p ON w.admission_period_id = p.id WHERE w.id = ?', [id]);
    if (!rows.length) throw { status: 404, message: 'Gelombang tidak ditemukan' };
    return this.format(rows[0]);
  }

  async checkOverlap(periodId, startDate, endDate, ignoreId = null) {
    let q = 'SELECT id FROM admission_waves WHERE admission_period_id = ? AND is_active = 1 AND (start_date <= ? AND end_date >= ?)';
    let params = [periodId, endDate, startDate];
    if (ignoreId) {
      q += ' AND id != ?';
      params.push(ignoreId);
    }
    const [rows] = await pool.query(q, params);
    return rows.length > 0;
  }

  async create(data) {
    if (!data.name || !data.registrationPeriodId || !data.startDate || !data.endDate) {
      throw { status: 422, message: 'Data tidak lengkap' };
    }
    if (new Date(data.endDate) < new Date(data.startDate)) {
      throw { status: 422, message: 'Tanggal akhir tidak boleh lebih kecil dari tanggal mulai' };
    }
    const period = await periodRepo.findById(data.registrationPeriodId);
    if (!period) throw { status: 422, message: 'Periode tidak valid' };

    // Validasi di dalam rentang periode
    if (new Date(data.startDate) < new Date(period.start_date) || new Date(data.endDate) > new Date(period.end_date)) {
      throw { status: 422, message: 'Tanggal gelombang harus berada di dalam rentang periode pendaftaran' };
    }

    if (data.isActive && await this.checkOverlap(data.registrationPeriodId, data.startDate, data.endDate)) {
      throw { status: 409, message: 'Gelombang aktif ini bertabrakan dengan gelombang aktif lainnya pada periode yang sama' };
    }

    const [res] = await pool.query('INSERT INTO admission_waves SET ?', [{
      name: data.name,
      admission_period_id: data.registrationPeriodId,
      start_date: data.startDate,
      end_date: data.endDate,
      is_active: data.isActive ? 1 : 0
    }]);
    
    return this.getById(res.insertId);
  }

  async update(id, data) {
    const existing = await this.getById(id).catch(() => null);
    if (!existing) throw { status: 404, message: 'Gelombang tidak ditemukan' };

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.registrationPeriodId !== undefined) {
      const period = await periodRepo.findById(data.registrationPeriodId);
      if (!period) throw { status: 422, message: 'Periode tidak valid' };
      updateData.admission_period_id = data.registrationPeriodId;
    }
    if (data.startDate !== undefined) updateData.start_date = data.startDate;
    if (data.endDate !== undefined) updateData.end_date = data.endDate;
    
    const start = updateData.start_date || existing.startDate;
    const end = updateData.end_date || existing.endDate;
    const periodId = updateData.admission_period_id || existing.period.id;

    if (new Date(end) < new Date(start)) {
      throw { status: 422, message: 'Tanggal akhir tidak boleh lebih kecil dari tanggal mulai' };
    }

    const period = await periodRepo.findById(periodId);
    if (new Date(start) < new Date(period.start_date) || new Date(end) > new Date(period.end_date)) {
      throw { status: 422, message: 'Tanggal gelombang harus berada di dalam rentang periode pendaftaran' };
    }

    if (existing.isActive && await this.checkOverlap(periodId, start, end, id)) {
      throw { status: 409, message: 'Gelombang aktif ini bertabrakan dengan gelombang aktif lainnya pada periode yang sama' };
    }

    if (Object.keys(updateData).length > 0) {
      await pool.query('UPDATE admission_waves SET ? WHERE id = ?', [updateData, id]);
    }
    return this.getById(id);
  }

  async updateStatus(id, isActive) {
    const existing = await this.getById(id).catch(() => null);
    if (!existing) throw { status: 404, message: 'Gelombang tidak ditemukan' };
    
    if (isActive && await this.checkOverlap(existing.period.id, existing.startDate, existing.endDate, id)) {
      throw { status: 409, message: 'Gelombang aktif ini bertabrakan dengan gelombang aktif lainnya pada periode yang sama' };
    }

    await pool.query('UPDATE admission_waves SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
    return this.getById(id);
  }

  format(row) {
    const sDate = row.start_date ? new Date(row.start_date) : null;
    const eDate = row.end_date ? new Date(row.end_date) : null;
    const sStr = sDate ? sDate.getFullYear()+'-'+String(sDate.getMonth()+1).padStart(2, '0')+'-'+String(sDate.getDate()).padStart(2, '0') : null;
    const eStr = eDate ? eDate.getFullYear()+'-'+String(eDate.getMonth()+1).padStart(2, '0')+'-'+String(eDate.getDate()).padStart(2, '0') : null;
    
    return {
      id: row.id,
      name: row.name,
      period: {
        id: row.admission_period_id,
        name: row.period_name
      },
      startDate: sStr,
      endDate: eStr,
      isActive: !!row.is_active
    };
  }
}
module.exports = new RegistrationWaveService();
