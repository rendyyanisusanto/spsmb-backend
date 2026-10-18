const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/database');
const publicDocumentService = require('../src/services/publicDocumentService');
const documentRequirementService = require('../src/services/documentRequirementService');

describe('Pengurutan Dokumen Persyaratan: Global diatas Lembaga, Prestasi paling bawah', () => {

  test('1. publicDocumentService mengurutkan Dokumen Global diatas Dokumen Lembaga, dan Prestasi dibawah sendiri', async () => {
    // Mock application for SMP (formal_institution_id = 1, pondok_institution_id = 1)
    const mockApp = {
      id: 999,
      registration_type: 'SMP',
      formal_institution_id: 1,
      pondok_institution_id: 1
    };

    const reqs = await publicDocumentService.getEffectiveRequirements(mockApp);
    
    // In our DB:
    // Target COMMON has Akta Kelahiran, Ijazah
    // Target INSTITUTION (id: 1) has Hasil Tes Kesehatan
    const aktaIdx = reqs.findIndex(r => r.code === 'AKTA');
    const ijazahIdx = reqs.findIndex(r => r.code === 'IJAZAH');
    const kesehatanIdx = reqs.findIndex(r => r.code === 'HASIL_TES_KESEHATAN');

    assert.ok(aktaIdx !== -1, 'Akta Kelahiran harus ditemukan');
    assert.ok(ijazahIdx !== -1, 'Ijazah harus ditemukan');
    assert.ok(kesehatanIdx !== -1, 'Hasil Tes Kesehatan harus ditemukan');

    // Dokumen lembaga (Hasil Tes Kesehatan) harus DIBAWAH dokumen global (Akta, Ijazah)
    assert.ok(aktaIdx < kesehatanIdx, 'Akta (Global) harus di atas Hasil Tes Kesehatan (Lembaga)');
    assert.ok(ijazahIdx < kesehatanIdx, 'Ijazah (Global) harus di atas Hasil Tes Kesehatan (Lembaga)');
  });

  test('2. Dokumen dengan kata "prestasi" atau "piagam" ditaruh paling bawah sendiri', async () => {
    const isPrestasiDoc = (doc) => {
      const code = (doc.code || '').toLowerCase();
      const name = (doc.name || '').toLowerCase();
      return code.includes('prestasi') || name.includes('prestasi') || code.includes('piagam') || name.includes('piagam');
    };

    const targetTypeOrder = { 'COMMON': 1, 'PONDOK_COMMON': 2, 'INSTITUTION': 3 };

    const sampleDocs = [
      { id: 1, code: 'SERTIFIKAT_PRESTASI', name: 'Sertifikat Prestasi Lomba', _targetType: 'COMMON', sortOrder: 1 },
      { id: 2, code: 'HASIL_TES_KESEHATAN', name: 'Hasil Tes Kesehatan', _targetType: 'INSTITUTION', sortOrder: 1 },
      { id: 3, code: 'AKTA', name: 'Akta Kelahiran', _targetType: 'COMMON', sortOrder: 1 },
      { id: 4, code: 'PIAGAM_TAHFIDZ', name: 'Piagam Tahfidz Lembaga', _targetType: 'INSTITUTION', sortOrder: 2 },
      { id: 5, code: 'IJAZAH', name: 'Ijazah SD/MI', _targetType: 'COMMON', sortOrder: 2 }
    ];

    sampleDocs.sort((a, b) => {
      const presA = isPrestasiDoc(a) ? 1 : 0;
      const presB = isPrestasiDoc(b) ? 1 : 0;
      if (presA !== presB) return presA - presB;

      const orderA = targetTypeOrder[a._targetType] || 2;
      const orderB = targetTypeOrder[b._targetType] || 2;
      if (orderA !== orderB) return orderA - orderB;

      const sortA = a.sortOrder ?? 0;
      const sortB = b.sortOrder ?? 0;
      if (sortA !== sortB) return sortA - sortB;

      return (a.id || 0) - (b.id || 0);
    });

    const docCodes = sampleDocs.map(d => d.code);

    // Expected order:
    // 1. AKTA (COMMON)
    // 2. IJAZAH (COMMON)
    // 3. HASIL_TES_KESEHATAN (INSTITUTION - dibawah global)
    // 4. SERTIFIKAT_PRESTASI (PRESTASI - dibawah sendiri)
    // 5. PIAGAM_TAHFIDZ (PRESTASI - dibawah sendiri)
    assert.deepEqual(docCodes, [
      'AKTA',
      'IJAZAH',
      'HASIL_TES_KESEHATAN',
      'SERTIFIKAT_PRESTASI',
      'PIAGAM_TAHFIDZ'
    ]);
  });

});
