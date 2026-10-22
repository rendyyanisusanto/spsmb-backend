const landingRepo = require('../repositories/landingRepository');
const faqRepo = require('../repositories/faqRepository');

class PublicLandingController {
  async getLandingPage(req, res, next) {
    try {
      const { slug } = req.params;
      const institution = await landingRepo.getInstitutionBySlug(slug);

      if (!institution) {
        return res.status(404).json({
          success: false,
          message: 'Lembaga tidak ditemukan atau tidak aktif.'
        });
      }

      // Fetch profile, featured programs, stats, waves, and institution FAQs in parallel
      const [profile, featuredPrograms, stats, waves, faqs] = await Promise.all([
        landingRepo.getProfile(institution.id),
        landingRepo.getFeaturedPrograms(institution.id),
        landingRepo.getStats(institution.id),
        landingRepo.getActiveWaves(institution.id),
        faqRepo.getActiveInstitutionFaqs(institution.id)
      ]);

      res.json({
        success: true,
        data: {
          institution: {
            id: institution.id,
            code: institution.code,
            slug: institution.slug,
            name: institution.name,
            type: institution.institution_type,
            genderScope: institution.gender_scope,
            logoUrl: institution.logo_url,
            kopUrl: institution.kop_url
          },
          profile: profile || {
            headline: `Penerimaan Santri & Siswa Baru ${institution.name}`,
            tagline: 'Membentuk Generasi Berakhlak Qurani, Unggul, dan Berdaya Saing Global',
            short_description: `${institution.name} membuka pendaftaran santri/siswa baru dengan kurikulum terpadu.`,
            full_profile: null,
            address: 'Sumberpasir, Pakis, Malang, Jawa Timur',
            phone: '081234567890',
            email: `info.${institution.code.toLowerCase()}@asy-syadzili.sch.id`,
            whatsapp_contact: '081234567890'
          },
          featuredPrograms,
          stats,
          waves,
          faqs
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Get profile & featured programs
  async getAdminProfile(req, res, next) {
    try {
      const institutionId = parseInt(req.params.id);
      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');

      if (!isSuperAdmin && !req.user.institutions.includes(institutionId)) {
        return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke lembaga ini.' });
      }

      const [profile, programs] = await Promise.all([
        landingRepo.getProfile(institutionId),
        landingRepo.getProgramsAdmin(institutionId)
      ]);

      res.json({
        success: true,
        data: {
          profile,
          featuredPrograms: programs
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Update profile
  async updateAdminProfile(req, res, next) {
    try {
      const institutionId = parseInt(req.params.id);
      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');

      if (!isSuperAdmin && !req.user.institutions.includes(institutionId)) {
        return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke lembaga ini.' });
      }

      await landingRepo.updateProfile(institutionId, req.body);
      const updated = await landingRepo.getProfile(institutionId);

      res.json({
        success: true,
        message: 'Profil lembaga berhasil diperbarui.',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Add featured program
  async addProgram(req, res, next) {
    try {
      const institutionId = parseInt(req.params.id);
      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');

      if (!isSuperAdmin && !req.user.institutions.includes(institutionId)) {
        return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke lembaga ini.' });
      }

      const { title, description, icon, order_index, is_published } = req.body;
      if (!title || !title.trim()) {
        return res.status(422).json({ success: false, message: 'Judul program wajib diisi.' });
      }

      const newId = await landingRepo.addProgram(institutionId, {
        title: title.trim(),
        description: description ? description.trim() : '',
        icon,
        order_index,
        is_published
      });

      res.status(201).json({
        success: true,
        message: 'Program unggulan berhasil ditambahkan.',
        data: { id: newId }
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Update featured program
  async updateProgram(req, res, next) {
    try {
      const programId = parseInt(req.params.programId);
      const { title, description, icon, order_index, is_published } = req.body;

      await landingRepo.updateProgram(programId, {
        title,
        description,
        icon,
        order_index,
        is_published
      });

      res.json({
        success: true,
        message: 'Program unggulan berhasil diperbarui.'
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin: Delete featured program
  async deleteProgram(req, res, next) {
    try {
      const programId = parseInt(req.params.programId);
      await landingRepo.deleteProgram(programId);

      res.json({
        success: true,
        message: 'Program unggulan berhasil dihapus.'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PublicLandingController();
