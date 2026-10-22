const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const pool = require('../src/config/database');
const crmLeadService = require('../src/services/crmLeadService');
const crmLeadRepository = require('../src/repositories/crmLeadRepository');

test('CRM Lead Import & Template Feature', async (t) => {
  const superAdmin = {
    id: 1,
    username: '404',
    primaryRole: 'SUPER_ADMIN',
    roles: ['SUPER_ADMIN'],
    institutions: []
  };

  const adminSmk = {
    id: 3,
    username: 'ferdy',
    primaryRole: 'ADMIN_SPSMB',
    roles: ['ADMIN_SPSMB'],
    institutions: [{ id: 5, name: 'SMK IT Asy-Syadzili' }]
  };

  const createdLeadIds = [];

  await t.test('1. generateImportTemplate menghasilkan buffer file XLSX yang valid dengan header lengkap', () => {
    const buffer = crmLeadService.generateImportTemplate();
    assert.ok(buffer && buffer.length > 0, 'Buffer template harus ada');

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    assert.ok(workbook.SheetNames.includes('Data Lead'), 'Harus memiliki sheet Data Lead');
    const sheet = workbook.Sheets['Data Lead'];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    assert.ok(rows.length >= 2, 'Harus ada header dan baris contoh');
    const headers = rows[0];
    assert.ok(headers.includes('Nama Lengkap'), 'Header harus memuat Nama Lengkap');
    assert.ok(headers.includes('No. WhatsApp'), 'Header harus memuat No. WhatsApp');
    assert.ok(headers.includes('Asal Sekolah'), 'Header harus memuat Asal Sekolah');
    assert.ok(headers.includes('Lembaga'), 'Header harus memuat Lembaga');
  });

  await t.test('2. importLeads dengan data JSON berhasil menyimpan lead dan status history', async () => {
    const sampleLeads = [
      {
        'Nama Lengkap': 'Test Impor Siswa A',
        'No. WhatsApp': '081299990001',
        'Asal Sekolah': 'SMP IT Contoh 1',
        'Alamat': 'Jl. Sumber Pasir Malang',
        'Nama Ayah': 'Bapak A',
        'Nama Ibu': 'Ibu A',
        'Minat': 'RPL',
        'Status': 'NEW',
        'Sumber Lead': 'Media Sosial',
        'Catatan': 'Uji impor A'
      },
      {
        'Nama Lengkap': 'Test Impor Siswa B',
        'No. WhatsApp': '081299990002',
        'Asal Sekolah': 'SMP IT Contoh 2',
        'Alamat': 'Jl. Pakis Malang',
        'Nama Ayah': 'Bapak B',
        'Nama Ibu': 'Ibu B',
        'Minat': 'TKJ',
        'Status': 'FOLLOW_UP',
        'Sumber Lead': 'Brosur',
        'Catatan': 'Uji impor B'
      }
    ];

    const result = await crmLeadService.importLeads(
      { institution_id: 5, leads: sampleLeads },
      null,
      adminSmk
    );

    assert.strictEqual(result.importedCount, 2, 'Harus berhasil import 2 lead');
    assert.strictEqual(result.skippedCount, 0, 'Tidak ada baris yang dilewati');

    // Verify in database
    const [savedLeads] = await pool.query(
      "SELECT id, full_name, phone, school_origin, status, institution_id FROM crm_leads WHERE full_name IN ('Test Impor Siswa A', 'Test Impor Siswa B')"
    );

    assert.strictEqual(savedLeads.length, 2, 'Data harus tersimpan di basis data');
    for (const lead of savedLeads) {
      createdLeadIds.push(lead.id);
      assert.strictEqual(lead.institution_id, 5, 'Institusi harus 5 (SMK)');
      const histories = await crmLeadRepository.findStatusHistoriesByLeadId(lead.id);
      assert.ok(histories.length > 0, 'Status history harus dibuat untuk lead yang diimpor');
    }
  });

  await t.test('3. importLeads dengan file buffer XLSX berhasil diurai dan disimpan', async () => {
    // Construct in-memory XLSX buffer
    const headers = [
      ['Nama Lengkap', 'No. WhatsApp', 'Asal Sekolah', 'Alamat', 'Minat', 'Lembaga'],
      ['Test Impor Excel C', '081399990003', 'MTs Negeri 1', 'Jl. Ijen', 'Akuntansi', 'SMK IT Asy-Syadzili']
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fakeFile = {
      buffer: buffer,
      originalname: 'test_leads.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    const result = await crmLeadService.importLeads(
      {},
      fakeFile,
      superAdmin
    );

    assert.strictEqual(result.importedCount, 1, 'Harus berhasil import 1 lead dari buffer');

    const [saved] = await pool.query("SELECT id, full_name, institution_id FROM crm_leads WHERE full_name = 'Test Impor Excel C'");
    assert.strictEqual(saved.length, 1);
    createdLeadIds.push(saved[0].id);
    assert.strictEqual(saved[0].institution_id, 5);
  });

  await t.test('4. Isolasi Lembaga: Admin SMK dilarang mengimpor lead untuk lembaga Pondok (403)', async () => {
    const leads = [{ 'Nama Lengkap': 'Test Ilegal', 'No. WhatsApp': '08111111' }];
    await assert.rejects(
      async () => {
        await crmLeadService.importLeads({ institution_id: 1, leads }, null, adminSmk);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.match(err.message, /tidak memiliki izin/i);
        return true;
      }
    );
  });

  t.after(async () => {
    // Clean up test leads
    if (createdLeadIds.length > 0) {
      await pool.query('DELETE FROM crm_leads WHERE id IN (?)', [createdLeadIds]);
    }
    await pool.end();
  });
});
