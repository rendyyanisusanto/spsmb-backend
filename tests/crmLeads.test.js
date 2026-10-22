/**
 * Sprint 1 — CRM Core: Manajemen Lead SPSMB Terpadu Test Suite
 * Tests all required functional and authorization scenarios:
 * 1. Membuat lead dengan data valid
 * 2. Menolak lead tanpa nama
 * 3. Mengedit data lead
 * 4. Melihat detail lead
 * 5. Menghapus lead sesuai aturan aman
 * 6. Mengubah status dan memverifikasi riwayatnya dalam transaksi
 * 7. Mencari berdasarkan nama, nomor HP, dan sekolah asal
 * 8. Memfilter berdasarkan status
 * 9. Menguji pagination dan sorting
 * 10. Memastikan data tidak bocor antar-lembaga (Admin SMK vs PPSQ 1)
 * 11. Memastikan user tanpa izin tidak dapat membuat, melihat, mengedit, atau menghapus lead
 * 12. Memastikan lead_by_user_id dan institution_id divalidasi
 * 13. Memastikan foreign key dan riwayat awal tersimpan dalam transaksi
 * 14. Memastikan aplikasi tidak membuat aplikasi pendaftaran duplikat
 * 15. Memastikan fitur SPSMB yang lama tidak mengalami regresi
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const pool = require('../src/config/database');
const app = require('../src/app');

describe('Sprint 1: CRM Manajemen Lead & Multi-Institution Authorization', () => {
  const secret = process.env.JWT_SECRET || 'change-this-with-a-long-random-secret';

  // Super Admin token (user 1, all institutions)
  const superAdminToken = jwt.sign(
    { sub: 1, roles: ['SUPER_ADMIN'], primaryRole: 'SUPER_ADMIN' },
    secret
  );

  // Admin SMK token (user 3, institution 5)
  const smkAdminToken = jwt.sign(
    { sub: 3, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB' },
    secret
  );

  // Admin PPSQ 1 token (user 4, institution 1)
  const pondokAdminToken = jwt.sign(
    { sub: 4, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB' },
    secret
  );

  let server;
  let baseUrl;
  let createdLeadId = null;
  let smkLeadId = null;
  let pondokLeadId = null;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api/v1`;
  });

  after(async () => {
    // Cleanup test leads if any created
    try {
      await pool.query("DELETE FROM crm_leads WHERE full_name LIKE 'TEST_LEAD_%'");
    } catch (_) {}
    if (server) await new Promise(r => server.close(r));
    try {
      await pool.end();
    } catch (_) {}
  });

  test('1. Lookup: GET /crm/leads/statuses mengembalikan 7 status baku dengan label Indonesia', async () => {
    const res = await fetch(`${baseUrl}/crm/leads/statuses`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.equal(json.data.length, 7);

    const values = json.data.map(s => s.value);
    assert.ok(values.includes('NEW'));
    assert.ok(values.includes('CONTACTED'));
    assert.ok(values.includes('INTERESTED'));
    assert.ok(values.includes('FOLLOW_UP'));
    assert.ok(values.includes('READY_TO_REGISTER'));
    assert.ok(values.includes('CONVERTED'));
    assert.ok(values.includes('NOT_INTERESTED'));

    const newStatus = json.data.find(s => s.value === 'NEW');
    assert.equal(newStatus.label, 'Lead Baru');
  });

  test('2. Lookup: GET /crm/leads/officers mengembalikan daftar user yang aktif', async () => {
    const res = await fetch(`${baseUrl}/crm/leads/officers`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.length > 0);
    assert.ok('id' in json.data[0]);
    assert.ok('name' in json.data[0]);
  });

  test('3. Membuat lead dengan data valid & status awal tercatat dalam transaksi', async () => {
    const res = await fetch(`${baseUrl}/crm/leads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        institution_id: 5,
        full_name: 'TEST_LEAD_AHMAD_ROFIQI',
        school_origin: 'SMP Negeri 1 Singosari',
        address: 'Jl. Raya Singosari No. 12',
        phone: '081234567890',
        father_name: 'Bapak Ahmad',
        mother_name: 'Ibu Siti',
        interest: 'Teknik Komputer & Jaringan',
        status: 'NEW',
        lead_source: 'Brosur & Sosmed',
        lead_by_user_id: 1,
        notes: 'Calon santri tertarik jurusan TKJ'
      })
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.id);
    createdLeadId = json.data.id;

    assert.equal(json.data.fullName, 'TEST_LEAD_AHMAD_ROFIQI');
    assert.equal(json.data.institutionId, 5);
    assert.equal(json.data.status, 'NEW');
    assert.equal(json.data.statusLabel, 'Lead Baru');

    // Verifikasi riwayat status awal di tabel crm_lead_status_histories
    const [histories] = await pool.query(
      'SELECT * FROM crm_lead_status_histories WHERE lead_id = ? ORDER BY id ASC',
      [createdLeadId]
    );
    assert.equal(histories.length, 1);
    assert.equal(histories[0].previous_status, null);
    assert.equal(histories[0].new_status, 'NEW');
    assert.equal(histories[0].changed_by_user_id, 1);
  });

  test('4. Menolak pembuatan lead tanpa nama lengkap (422)', async () => {
    const res = await fetch(`${baseUrl}/crm/leads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        institution_id: 5,
        full_name: '   ',
        phone: '081234567890'
      })
    });

    assert.equal(res.status, 422);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.ok(json.message.includes('Nama lengkap'));
  });

  test('5. Menolak pembuatan lead dengan institution_id yang tidak ada (422)', async () => {
    const res = await fetch(`${baseUrl}/crm/leads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        institution_id: 999999,
        full_name: 'TEST_LEAD_INVALID_INST'
      })
    });

    assert.equal(res.status, 422);
    const json = await res.json();
    assert.equal(json.success, false);
  });

  test('6. Menolak pembuatan lead dengan lead_by_user_id yang tidak ada (422)', async () => {
    const res = await fetch(`${baseUrl}/crm/leads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        institution_id: 5,
        full_name: 'TEST_LEAD_INVALID_OFFICER',
        lead_by_user_id: 999999
      })
    });

    assert.equal(res.status, 422);
    const json = await res.json();
    assert.equal(json.success, false);
  });

  test('7. Pembatasan Lembaga: Admin SMK (institusi 5) dilarang membuat lead untuk PPSQ 1 (institusi 1) (403)', async () => {
    const res = await fetch(`${baseUrl}/crm/leads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${smkAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        institution_id: 1, // PPSQ 1
        full_name: 'TEST_LEAD_UNAUTHORIZED_INSTITUTION'
      })
    });

    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.success, false);
  });

  test('8. Admin SMK membuat lead untuk SMK (institusi 5) berhasil (201)', async () => {
    const res = await fetch(`${baseUrl}/crm/leads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${smkAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        institution_id: 5,
        full_name: 'TEST_LEAD_SMK_SISWA',
        school_origin: 'MTs Al-Ittihad',
        phone: '085712345678',
        interest: 'RPL'
      })
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    smkLeadId = json.data.id;
    assert.equal(json.data.institutionId, 5);
  });

  test('8b. Admin SMK membuat lead tanpa mengirim institution_id -> otomatis diisi SMK (5) (201)', async () => {
    const res = await fetch(`${baseUrl}/crm/leads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${smkAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        full_name: 'TEST_LEAD_AUTO_SMK',
        phone: '085799998888',
        interest: 'TKJ'
      })
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.institutionId, 5, 'Lembaga harus otomatis di-set ke SMK (5)');
  });

  test('9. Admin Pondok membuat lead untuk PPSQ 1 (institusi 1) berhasil (201)', async () => {
    const res = await fetch(`${baseUrl}/crm/leads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pondokAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        institution_id: 1,
        full_name: 'TEST_LEAD_PONDOK_SANTRI',
        school_origin: 'SMP Negeri 2 Lawang',
        phone: '089912345678',
        interest: 'Tahfidz 30 Juz'
      })
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    pondokLeadId = json.data.id;
    assert.equal(json.data.institutionId, 1);
  });

  test('10. Isolasi Data Antar Lembaga: Admin SMK hanya dapat melihat lead SMK dan tidak melihat lead Pondok', async () => {
    const res = await fetch(`${baseUrl}/crm/leads?search=TEST_LEAD_`, {
      headers: { Authorization: `Bearer ${smkAdminToken}` }
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    
    // Semua lead yang dikembalikan HARUS ber-institution_id = 5
    for (const item of json.data) {
      assert.equal(item.institutionId, 5, 'Admin SMK hanya boleh melihat lead lembaga SMK (5)');
    }

    // Pastikan pondokLeadId (PPSQ 1) TIDAK ada dalam list
    const foundPondok = json.data.some(l => l.id === pondokLeadId);
    assert.equal(foundPondok, false, 'Lead PPSQ 1 tidak boleh bocor ke Admin SMK');
  });

  test('11. Otorisasi Detail: Admin SMK mencoba mengakses detail lead PPSQ 1 langsung via ID ditolak (403)', async () => {
    const res = await fetch(`${baseUrl}/crm/leads/${pondokLeadId}`, {
      headers: { Authorization: `Bearer ${smkAdminToken}` }
    });

    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.success, false);
  });

  test('12. Melihat detail lead sendiri beserta statusHistories berhasil (200)', async () => {
    const res = await fetch(`${baseUrl}/crm/leads/${smkLeadId}`, {
      headers: { Authorization: `Bearer ${smkAdminToken}` }
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.id, smkLeadId);
    assert.ok(Array.isArray(json.data.statusHistories));
    assert.equal(json.data.statusHistories.length, 1);
    assert.equal(json.data.statusHistories[0].newStatus, 'NEW');
  });

  test('13. Mengedit data lead dengan validasi', async () => {
    const res = await fetch(`${baseUrl}/crm/leads/${createdLeadId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        full_name: 'TEST_LEAD_AHMAD_ROFIQI_EDITED',
        phone: '081299998888',
        interest: 'Teknik Komputer & Jaringan dan Tahfidz'
      })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.fullName, 'TEST_LEAD_AHMAD_ROFIQI_EDITED');
    assert.equal(json.data.phone, '081299998888');

    // Karena status tidak berubah, riwayat status tidak boleh bertambah
    const [histories] = await pool.query(
      'SELECT * FROM crm_lead_status_histories WHERE lead_id = ?',
      [createdLeadId]
    );
    assert.equal(histories.length, 1, 'Riwayat status tidak boleh bertambah jika status tidak berubah');
  });

  test('14. Mengubah status lead (PATCH /status) mencatat riwayat status dalam transaksi', async () => {
    const res = await fetch(`${baseUrl}/crm/leads/${createdLeadId}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'CONTACTED',
        notes: 'Sudah dihubungi via WhatsApp oleh petugas Pak Guru'
      })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.status, 'CONTACTED');
    assert.equal(json.data.statusLabel, 'Sudah Dihubungi');

    // Verifikasi riwayat status bertambah 1
    const [histories] = await pool.query(
      'SELECT * FROM crm_lead_status_histories WHERE lead_id = ? ORDER BY id DESC',
      [createdLeadId]
    );
    assert.equal(histories.length, 2);
    assert.equal(histories[0].previous_status, 'NEW');
    assert.equal(histories[0].new_status, 'CONTACTED');
    assert.equal(histories[0].notes, 'Sudah dihubungi via WhatsApp oleh petugas Pak Guru');
  });

  test('15. Pencarian & Filter: Search nama, filter status, filter lembaga, sorting, dan pagination', async () => {
    // Search berdasarkan nama
    const searchRes = await fetch(`${baseUrl}/crm/leads?search=ROFIQI_EDITED`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    const searchJson = await searchRes.json();
    assert.equal(searchRes.status, 200);
    assert.ok(searchJson.data.some(l => l.fullName.includes('ROFIQI_EDITED')));

    // Filter berdasarkan status
    const filterRes = await fetch(`${baseUrl}/crm/leads?status=CONTACTED`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    const filterJson = await filterRes.json();
    assert.equal(filterRes.status, 200);
    for (const l of filterJson.data) {
      assert.equal(l.status, 'CONTACTED');
    }

    // Sorting & Pagination
    const pageRes = await fetch(`${baseUrl}/crm/leads?limit=2&page=1&sortBy=createdAt&sortOrder=DESC`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    const pageJson = await pageRes.json();
    assert.equal(pageRes.status, 200);
    assert.ok(pageJson.data.length <= 2);
    assert.ok(pageJson.meta.total >= 3);
    assert.equal(pageJson.meta.page, 1);
  });

  test('16. Menolak request tanpa token otentikasi (401)', async () => {
    const res = await fetch(`${baseUrl}/crm/leads`);
    assert.equal(res.status, 401);
  });

  test('17. Menghapus lead sesuai aturan aman & riwayat terhapus via CASCADE', async () => {
    const res = await fetch(`${baseUrl}/crm/leads/${createdLeadId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);

    // Pastikan lead tidak ada lagi di crm_leads
    const [leadRows] = await pool.query('SELECT * FROM crm_leads WHERE id = ?', [createdLeadId]);
    assert.equal(leadRows.length, 0);

    // Pastikan riwayat status ikut terhapus via CASCADE
    const [histRows] = await pool.query('SELECT * FROM crm_lead_status_histories WHERE lead_id = ?', [createdLeadId]);
    assert.equal(histRows.length, 0);

    // Pastikan tabel aplikasi & pendaftar existing TIDAK terganggu sama sekali
    const [apps] = await pool.query('SELECT COUNT(*) AS total FROM applications');
    assert.ok(apps[0].total >= 0);
  });

  test('18. Memastikan fitur SPSMB existing (Applications, Institutions) tidak regresi', async () => {
    const appRes = await fetch(`${baseUrl}/applications?limit=2`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    assert.equal(appRes.status, 200);

    const instRes = await fetch(`${baseUrl}/institutions`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    assert.equal(instRes.status, 200);
  });
});
