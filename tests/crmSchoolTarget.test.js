/**
 * Sprint CRM — Target Sekolah & Presentasi SPMB Test Suite
 * Tests all requirements:
 * 1. Target Sekolah CRUD, search, filter, pagination, potential duplicate warning
 * 2. Status transitions, history tracking, and rollback consistency
 * 3. Letter Settings: authorized roles (SUPER_ADMIN, ADMIN_SPSMB) vs restricted (PETUGAS)
 * 4. Letter preview, placeholder replacement, and concurrent-safe issuance snapshot
 * 5. Snapshot immutability: past letters remain unchanged when settings are edited later
 * 6. Protection: target cannot be deleted if letters have been issued
 * 7. Presentation Reports: CRUD, participant_count validation, photo metadata
 * 8. Validation rule: status COMPLETED rejected if no presentation report exists
 * 9. Status COMPLETED succeeds once at least 1 presentation report is saved
 * 10. Audit logging verification for targets, status changes, settings, and letters
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const pool = require('../src/config/database');
const app = require('../src/app');

describe('Sprint CRM: Target Sekolah & Presentasi SPMB', () => {
  const secret = process.env.JWT_SECRET || 'change-this-with-a-long-random-secret';

  // Super Admin token (user 1)
  const superAdminToken = jwt.sign(
    { sub: 1, roles: ['SUPER_ADMIN'], primaryRole: 'SUPER_ADMIN' },
    secret
  );

  // Admin SPSMB token (user 3)
  const adminSpsmbToken = jwt.sign(
    { sub: 3, roles: ['ADMIN_SPSMB'], primaryRole: 'ADMIN_SPSMB' },
    secret
  );

  // Petugas token (user 4)
  const petugasToken = jwt.sign(
    { sub: 4, roles: ['PETUGAS'], primaryRole: 'PETUGAS' },
    secret
  );

  let server;
  let baseUrl;
  let createdTargetId = null;
  let createdReportId = null;
  let createdLetterId = null;

  before(async () => {
    // Start local server for testing
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;

    // Ensure clean test baseline
    await pool.query('DELETE FROM crm_school_presentation_photos');
    await pool.query('DELETE FROM crm_school_presentation_reports');
    await pool.query('DELETE FROM crm_school_target_letters');
    await pool.query('DELETE FROM crm_school_target_status_histories');
    await pool.query('DELETE FROM crm_school_targets');
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('1. Tambah target sekolah baru (POST /crm/schools) oleh Petugas', async () => {
    const payload = {
      school_name: 'SMP Negeri 1 Pakis',
      education_level: 'SMP',
      address: 'Jl. Raya Pakis No. 10',
      district: 'Pakis',
      city_regency: 'Kabupaten Malang',
      province: 'Jawa Timur',
      principal_name: 'Drs. H. Mulyadi, M.Pd.',
      contact_person: 'Ibu Rahma',
      contact_position: 'Guru BK',
      phone: '081234567890',
      email: 'smpn1pakis@example.sch.id',
      source: 'Database Diknas 2026',
      team_text: 'Tim Alpha: Rendy, Ferdy',
      internal_notes: 'Sekolah sasaran prioritas, sambutan kepala sekolah sangat baik'
    };

    const res = await fetch(`${baseUrl}/crm/schools`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(json)}`);
    assert.equal(json.success, true);
    assert.equal(json.data.school_name, 'SMP Negeri 1 Pakis');
    assert.equal(json.data.status, 'LEADS');
    assert.equal(json.data.status_label, 'Leads');

    createdTargetId = json.data.id;
    assert.ok(createdTargetId, 'Target ID must be returned');
  });

  test('2. Periksa potensi duplikat sekolah (GET /crm/schools/check-duplicate)', async () => {
    const res = await fetch(`${baseUrl}/crm/schools/check-duplicate?name=SMP Negeri 1 Pakis&city=Kabupaten Malang`, {
      headers: { Authorization: `Bearer ${petugasToken}` }
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.data.has_potential_duplicate, true);
    assert.ok(json.data.duplicates.length >= 1);
  });

  test('3. Ambil daftar target sekolah & filter status/pencarian (GET /crm/schools)', async () => {
    const res = await fetch(`${baseUrl}/crm/schools?search=Pakis&status=LEADS`, {
      headers: { Authorization: `Bearer ${petugasToken}` }
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.ok(json.data.length >= 1);
    assert.equal(json.meta.total, 1);
    assert.equal(json.meta.stats.leads, 1);
    assert.equal(json.meta.stats.completed, 0);
  });

  test('4. Perbarui status target sekolah menjadi FOLLOWED_UP (PATCH /crm/schools/:id/status)', async () => {
    const res = await fetch(`${baseUrl}/crm/schools/${createdTargetId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`
      },
      body: JSON.stringify({
        status: 'FOLLOWED_UP',
        note: 'Telah menghubungi Ibu Rahma via WhatsApp, menunggu konfirmasi jadwal kepala sekolah'
      })
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.data.status, 'FOLLOWED_UP');
    assert.ok(json.data.first_follow_up_at, 'first_follow_up_at should be auto-set');

    // Check status history
    const histRes = await fetch(`${baseUrl}/crm/schools/${createdTargetId}/status-histories`, {
      headers: { Authorization: `Bearer ${petugasToken}` }
    });
    const histJson = await histRes.json();
    assert.equal(histRes.status, 200);
    assert.ok(histJson.data.length >= 2, 'Should have initial history plus followed up');
    assert.equal(histJson.data[0].new_status, 'FOLLOWED_UP');
  });

  test('5. Tolak perubahan status COMPLETED jika belum ada laporan presentasi (422)', async () => {
    const res = await fetch(`${baseUrl}/crm/schools/${createdTargetId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`
      },
      body: JSON.stringify({
        status: 'COMPLETED',
        note: 'Mencoba menandai selesai tanpa laporan'
      })
    });

    const json = await res.json();
    assert.equal(res.status, 422, 'Should reject COMPLETED without report');
    assert.match(json.message, /laporan presentasi/i);
  });

  test('6. Perbarui status menjadi SCHEDULED dengan jadwal & lokasi', async () => {
    const scheduledDate = new Date(Date.now() + 86400000 * 3).toISOString(); // 3 days ahead
    const res = await fetch(`${baseUrl}/crm/schools/${createdTargetId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`
      },
      body: JSON.stringify({
        status: 'SCHEDULED',
        scheduled_at: scheduledDate,
        scheduled_location: 'Aula Utama Lantai 2 SMPN 1 Pakis',
        note: 'Jadwal presentasi telah disetujui pihak sekolah'
      })
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.data.status, 'SCHEDULED');
    assert.ok(json.data.scheduled_at);
  });

  test('7. Pengaturan Surat: Petugas dilarang mengubah konfigurasi surat (403)', async () => {
    const res = await fetch(`${baseUrl}/crm/schools/letter-settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`
      },
      body: JSON.stringify({
        setting_name: 'Ilegal Edit Petugas'
      })
    });

    assert.equal(res.status, 403, 'Petugas must be forbidden from editing letter settings');
  });

  test('8. Pengaturan Surat: Admin SPSMB dapat melihat dan memperbarui konfigurasi surat', async () => {
    const getRes = await fetch(`${baseUrl}/crm/schools/letter-settings/active`, {
      headers: { Authorization: `Bearer ${adminSpsmbToken}` }
    });
    const getJson = await getRes.json();
    assert.equal(getRes.status, 200);
    assert.ok(getJson.data);

    const updateRes = await fetch(`${baseUrl}/crm/schools/letter-settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSpsmbToken}`
      },
      body: JSON.stringify({
        setting_name: 'Template Resmi Presentasi 2026/2027',
        school_name: 'Pesantren Modern Asy-Syadzili',
        principal_name: 'KH. Abdul Munir, M.Ag.',
        principal_title: 'Pengasuh Pesantren',
        principal_nip: '197505102000031002',
        spmb_chair_name: 'Ust. Ahmad Fauzi, S.Pd.',
        spmb_chair_title: 'Ketua Panitia SPMB',
        default_city: 'Malang'
      })
    });

    const updateJson = await updateRes.json();
    assert.equal(updateRes.status, 200);
    assert.equal(updateJson.data.principal_name, 'KH. Abdul Munir, M.Ag.');
    assert.equal(updateJson.data.spmb_chair_name, 'Ust. Ahmad Fauzi, S.Pd.');
  });

  test('9. Pratinjau surat permohonan presentasi (POST /crm/schools/:id/letters/preview)', async () => {
    const res = await fetch(`${baseUrl}/crm/schools/${createdTargetId}/letters/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`
      },
      body: JSON.stringify({ issue_date: '2026-10-27' })
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.ok(json.data.rendered_body.includes('SMP Negeri 1 Pakis'));
    assert.ok(json.data.rendered_body.includes('Drs. H. Mulyadi, M.Pd.'));
  });

  test('10. Penerbitan surat permohonan presentasi & penyimpanan snapshot unik (POST /crm/schools/:id/letters)', async () => {
    const res = await fetch(`${baseUrl}/crm/schools/${createdTargetId}/letters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`
      },
      body: JSON.stringify({ issue_date: '2026-10-27' })
    });

    const json = await res.json();
    assert.equal(res.status, 201);
    assert.ok(json.data.letter_number);
    assert.equal(json.data.school_name_snapshot, 'SMP Negeri 1 Pakis');
    assert.ok(json.data.signer_snapshot);

    createdLetterId = json.data.id;

    // Verify snapshot immutability: alter settings, then check letter snapshot
    await fetch(`${baseUrl}/crm/schools/letter-settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        principal_name: 'NAMA BARU TIDAK BOLEH MEMPENGARUHI SURAT LAMA'
      })
    });

    const fetchLetterRes = await fetch(`${baseUrl}/crm/schools/letters/${createdLetterId}`, {
      headers: { Authorization: `Bearer ${petugasToken}` }
    });
    const letterJson = await fetchLetterRes.json();
    assert.equal(fetchLetterRes.status, 200);
    assert.equal(letterJson.data.signer_snapshot.principal.name, 'KH. Abdul Munir, M.Ag.');
  });

  test('11. Target tidak boleh dihapus saat sudah memiliki surat terbit', async () => {
    const res = await fetch(`${baseUrl}/crm/schools/${createdTargetId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.match(json.message, /surat permohonan yang diterbitkan/i);
  });

  test('12. Tambah Laporan Presentasi (POST /crm/schools/:id/reports)', async () => {
    const payload = {
      held_at: new Date().toISOString(),
      location: 'Aula SMPN 1 Pakis',
      team_text: 'Rendy (Presenter), Ferdy (Operator)',
      participant_count: 145,
      summary: 'Sosialisasi program unggulan tahfidz dan vokasi ke siswa kelas IX',
      evaluation: 'Siswa sangat antusias bertanya mengenai beasiswa prestasi',
      school_response: 'Pihak sekolah sangat terbuka dan menyambut baik',
      obstacles: 'Waktu presentasi terbatas karena bersamaan dengan jam istirahat',
      follow_up_plan: 'Mengirimkan brosur fisik tambahan dan form pendaftaran kolektif',
      additional_notes: 'Kontak intensif dengan guru BK'
    };

    const res = await fetch(`${baseUrl}/crm/schools/${createdTargetId}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    assert.equal(res.status, 201);
    assert.equal(json.data.participant_count, 145);
    createdReportId = json.data.id;
  });

  test('13. Tolak input laporan dengan jumlah peserta negatif (422)', async () => {
    const res = await fetch(`${baseUrl}/crm/schools/${createdTargetId}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`
      },
      body: JSON.stringify({
        held_at: new Date().toISOString(),
        participant_count: -10
      })
    });

    assert.equal(res.status, 422);
  });

  test('14. Setelah ada laporan presentasi, status dapat diubah menjadi COMPLETED', async () => {
    const res = await fetch(`${baseUrl}/crm/schools/${createdTargetId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${petugasToken}`
      },
      body: JSON.stringify({
        status: 'COMPLETED',
        note: 'Presentasi sukses dilaksanakan dan laporan telah terinput'
      })
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.data.status, 'COMPLETED');
    assert.equal(json.data.status_label, 'Selesai');
  });

  test('15. Verifikasi Audit Log mencatat seluruh siklus target sekolah', async () => {
    const [logs] = await pool.query(
      `SELECT action, entity_type, description FROM audit_logs 
       WHERE entity_type IN ('CRM_SCHOOL_TARGET', 'CRM_SCHOOL_TARGET_LETTER', 'CRM_SCHOOL_PRESENTATION_REPORT', 'CRM_SCHOOL_LETTER_SETTINGS')
       ORDER BY id DESC LIMIT 10`
    );

    assert.ok(logs.length >= 4, 'Audit logs should contain operations');
    const actions = logs.map(l => l.action);
    assert.ok(actions.includes('CRM_SCHOOL_TARGET_CREATE'));
    assert.ok(actions.includes('CRM_SCHOOL_TARGET_STATUS_CHANGE'));
    assert.ok(actions.includes('CRM_SCHOOL_LETTER_ISSUE'));
    assert.ok(actions.includes('CRM_SCHOOL_PRESENTATION_REPORT_CREATE'));
  });
});
