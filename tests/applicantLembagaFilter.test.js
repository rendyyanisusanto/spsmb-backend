const test = require('node:test');
const assert = require('node:assert');
const pool = require('../src/config/database');
const applicationRepository = require('../src/repositories/applicationRepository');
const applicationService = require('../src/services/applicationService');

test('Filter Lembaga pada Data Pendaftar', async (t) => {
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

  await t.test('1. Repository findApplications & countApplications dengan filter lembaga SMP IT Asy-Syadzili', async () => {
    const apps = await applicationRepository.findApplications({ lembaga: 'SMP IT Asy-Syadzili' });
    const count = await applicationRepository.countApplications({ lembaga: 'SMP IT Asy-Syadzili' });

    assert.ok(apps.length > 0, 'Harus ada data SMP');
    assert.strictEqual(apps.length, count, 'Count harus sama dengan data yang diambil');
    for (const app of apps) {
      const match = app.formalInstitutionName === 'SMP IT Asy-Syadzili' || 
                    app.registrationType === 'SMP';
      assert.ok(match, 'Setiap pendaftar harus terikat dengan SMP IT Asy-Syadzili');
    }
  });

  await t.test('2. Repository findApplications & countApplications dengan filter lembaga SMK IT Asy-Syadzili', async () => {
    const apps = await applicationRepository.findApplications({ lembaga: 'SMK IT Asy-Syadzili' });
    const count = await applicationRepository.countApplications({ lembaga: 'SMK IT Asy-Syadzili' });

    assert.ok(apps.length > 0, 'Harus ada data SMK');
    assert.strictEqual(apps.length, count, 'Count harus sama dengan data yang diambil');
    for (const app of apps) {
      const match = app.formalInstitutionName === 'SMK IT Asy-Syadzili' || 
                    app.registrationType === 'SMK';
      assert.ok(match, 'Setiap pendaftar harus terikat dengan SMK IT Asy-Syadzili');
    }
  });

  await t.test('3. Service getApplications dengan filter lembaga memformat data dengan benar', async () => {
    const result = await applicationService.getApplications({ lembaga: 'SMP IT Asy-Syadzili' }, superAdmin);
    assert.ok(result.data.length > 0, 'Harus mengembalikan data');
    assert.ok(result.meta.total > 0, 'Meta total harus lebih dari 0');
    assert.strictEqual(result.data[0].formalInstitution?.name, 'SMP IT Asy-Syadzili');
  });

  await t.test('4. Service exportApplications dengan filter lembaga mengembalikan data yang terfilter', async () => {
    const exportData = await applicationService.exportApplications({ lembaga: 'SMP IT Asy-Syadzili' }, superAdmin);
    assert.ok(Array.isArray(exportData), 'Export data harus array');
    assert.ok(exportData.length > 0, 'Harus ada data yang diexport');
  });

  await t.test('5. Admin SPSMB dengan scope SMK hanya melihat data SMK meskipun tidak filter', async () => {
    const result = await applicationService.getApplications({}, adminSmk);
    assert.ok(result.data.length > 0, 'Admin SMK memiliki pendaftar');
    for (const app of result.data) {
      assert.strictEqual(app.formalInstitution?.id, 5, 'Semua pendaftar harus memiliki formal_institution_id = 5');
    }
  });

  t.after(async () => {
    await pool.end();
  });
});
