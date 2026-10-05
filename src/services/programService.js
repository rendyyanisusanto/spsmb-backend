
const pool = require('../config/database');

class ProgramService {
  async getAll(query, user) {
    const limit = parseInt(query.limit) || 10;
    const page = parseInt(query.page) || 1;
    const offset = (page - 1) * limit;
    
    let q = 'SELECT m.*, i.name as institution_name, i.institution_type FROM majors m LEFT JOIN institutions i ON m.institution_id = i.id WHERE 1=1';
    const params = [];
    
    if (query.institutionId) {
      q += ' AND m.institution_id = ?';
      params.push(query.institutionId);
    }
    
    // scope
    const isSuper = user.roles.includes('SUPER_ADMIN');
    if (!isSuper) {
      if (user.institutions.length === 0) {
        return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
      }
      q += ' AND m.institution_id IN (?)';
      params.push(user.institutions);
    }

    if (query.status) {
      q += ' AND m.is_active = ?';
      params.push(query.status === 'ACTIVE' ? 1 : 0);
    }
    if (query.search) {
      q += ' AND (m.name LIKE ? OR m.code LIKE ?)';
      params.push('%' + query.search + '%', '%' + query.search + '%');
    }
    
    let countQuery = q.replace('SELECT m.*, i.name as institution_name, i.institution_type', 'SELECT COUNT(*) as total');
    
    q += ' ORDER BY m.id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const [rows] = await pool.query(q, params);
    const [[{ total }]] = await pool.query(countQuery, params.slice(0, -2));
    
    return {
      data: rows.map(this.format),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  async getById(id, user) {
    const [rows] = await pool.query('SELECT m.*, i.name as institution_name, i.institution_type FROM majors m LEFT JOIN institutions i ON m.institution_id = i.id WHERE m.id = ?', [id]);
    if (!rows.length) throw { status: 404, message: 'Program tidak ditemukan' };
    const p = rows[0];
    
    if (!user.roles.includes('SUPER_ADMIN') && !user.institutions.includes(p.institution_id)) {
      throw { status: 403, message: 'Akses ditolak' };
    }
    
    return this.format(p);
  }

  async create(data, user) {
    if (!data.institutionId || !data.name || !data.code) {
      throw { status: 422, message: 'Data tidak lengkap' };
    }
    
    if (!user.roles.includes('SUPER_ADMIN') && !user.institutions.includes(data.institutionId)) {
      throw { status: 403, message: 'Akses ditolak untuk lembaga ini' };
    }

    const [[count]] = await pool.query('SELECT COUNT(*) as c FROM majors WHERE code = ? AND institution_id = ?', [data.code, data.institutionId]);
    if (count.c > 0) {
      throw { status: 409, message: 'Kode program sudah digunakan di lembaga ini' };
    }

    const [res] = await pool.query('INSERT INTO majors SET ?', [{
      institution_id: data.institutionId,
      code: data.code,
      name: data.name,
      is_active: data.isActive === undefined ? 1 : (data.isActive ? 1 : 0)
    }]);
    
    return this.getById(res.insertId, user);
  }

  async update(id, data, user) {
    const existing = await this.getById(id, user); // this validates scope

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.code !== undefined) {
      if (data.code !== existing.code) {
        const [[count]] = await pool.query('SELECT COUNT(*) as c FROM majors WHERE code = ? AND institution_id = ?', [data.code, existing.institution.id]);
        if (count.c > 0) {
          throw { status: 409, message: 'Kode program sudah digunakan di lembaga ini' };
        }
      }
      updateData.code = data.code;
    }
    
    if (data.institutionId !== undefined && data.institutionId !== existing.institution.id) {
      if (!user.roles.includes('SUPER_ADMIN')) {
        throw { status: 403, message: 'Tidak dapat memindah program ke lembaga lain' };
      }
      const [[count]] = await pool.query('SELECT COUNT(*) as c FROM majors WHERE code = ? AND institution_id = ?', [updateData.code || existing.code, data.institutionId]);
      if (count.c > 0) throw { status: 409, message: 'Kode program sudah digunakan di lembaga tujuan' };
      updateData.institution_id = data.institutionId;
    }

    if (Object.keys(updateData).length > 0) {
      await pool.query('UPDATE majors SET ? WHERE id = ?', [updateData, id]);
    }
    return this.getById(id, { roles: ['SUPER_ADMIN'] }); // fetch without checking user scope again
  }

  async updateStatus(id, isActive, user) {
    await this.getById(id, user); // validates scope
    await pool.query('UPDATE majors SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
    return this.getById(id, { roles: ['SUPER_ADMIN'] });
  }

  async delete(id, user) {
    await this.getById(id, user);
    await pool.query('DELETE FROM majors WHERE id = ?', [id]);
  }

  async getPublicPrograms(institutionId) {
    const [rows] = await pool.query('SELECT id, code, name FROM majors WHERE institution_id = ? AND is_active = 1 ORDER BY id ASC', [institutionId]);
    return rows;
  }

  format(row) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description || '',
      isActive: !!row.is_active,
      sortOrder: row.sort_order || row.id,
      institution: {
        id: row.institution_id,
        name: row.institution_name,
        type: row.institution_type
      }
    };
  }
}
module.exports = new ProgramService();
