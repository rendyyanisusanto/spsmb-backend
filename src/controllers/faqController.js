const faqRepo = require('../repositories/faqRepository');

class FaqController {
  // Public Endpoint: Global FAQs
  async getPublicGlobalFaqs(req, res, next) {
    try {
      const search = req.query.q || '';
      const data = await faqRepo.getActiveGlobalFaqs(search);
      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin Endpoints
  async getAllFaqs(req, res, next) {
    try {
      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      let targetInstitutionId = req.query.institution_id ? parseInt(req.query.institution_id) : null;
      const scope = req.query.scope || null;
      const search = req.query.q || '';

      if (!isSuperAdmin) {
        // If not super admin, restrict institutionId to user institutions
        if (targetInstitutionId && !req.user.institutions.includes(targetInstitutionId)) {
          return res.status(403).json({
            success: false,
            message: 'Anda tidak memiliki akses ke lembaga ini.'
          });
        }
        if (!targetInstitutionId && req.user.institutions.length > 0) {
          targetInstitutionId = req.user.institutions[0];
        }
      }

      const data = await faqRepo.getAllFaqsAdmin(scope, targetInstitutionId, search);
      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }

  async getFaqDetail(req, res, next) {
    try {
      const id = parseInt(req.params.id);
      const faq = await faqRepo.findById(id);
      if (!faq) {
        return res.status(404).json({ success: false, message: 'FAQ tidak ditemukan.' });
      }

      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      if (faq.scope === 'INSTITUTION' && !isSuperAdmin && !req.user.institutions.includes(faq.institution_id)) {
        return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke FAQ lembaga ini.' });
      }

      res.json({ success: true, data: faq });
    } catch (error) {
      next(error);
    }
  }

  async createFaq(req, res, next) {
    try {
      const { scope, institution_id, category, question, answer, order_index, is_active } = req.body;
      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');

      if (!question || !question.trim()) {
        return res.status(422).json({ success: false, message: 'Pertanyaan wajib diisi.' });
      }
      if (!answer || !answer.trim()) {
        return res.status(422).json({ success: false, message: 'Jawaban wajib diisi.' });
      }

      const targetScope = scope === 'INSTITUTION' ? 'INSTITUTION' : 'GLOBAL';

      if (targetScope === 'GLOBAL' && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Hanya Super Admin yang dapat menambahkan FAQ Global.'
        });
      }

      let parsedInstId = null;
      if (targetScope === 'INSTITUTION') {
        parsedInstId = parseInt(institution_id);
        if (!parsedInstId) {
          return res.status(422).json({ success: false, message: 'Lembaga wajib dipilih untuk FAQ lembaga.' });
        }
        if (!isSuperAdmin && !req.user.institutions.includes(parsedInstId)) {
          return res.status(403).json({
            success: false,
            message: 'Anda tidak memiliki hak untuk menambahkan FAQ di lembaga ini.'
          });
        }
      }

      const id = await faqRepo.create({
        scope: targetScope,
        institution_id: parsedInstId,
        category: category || 'UMUM',
        question: question.trim(),
        answer: answer.trim(),
        order_index: order_index || 1,
        is_active: is_active !== undefined ? is_active : 1,
        created_by: req.user.id
      });

      const newFaq = await faqRepo.findById(id);
      res.status(201).json({
        success: true,
        message: 'FAQ berhasil dibuat.',
        data: newFaq
      });
    } catch (error) {
      next(error);
    }
  }

  async updateFaq(req, res, next) {
    try {
      const id = parseInt(req.params.id);
      const existing = await faqRepo.findById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'FAQ tidak ditemukan.' });
      }

      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      if (existing.scope === 'GLOBAL' && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Hanya Super Admin yang dapat mengubah FAQ Global.'
        });
      }

      if (existing.scope === 'INSTITUTION' && !isSuperAdmin && !req.user.institutions.includes(existing.institution_id)) {
        return res.status(403).json({
          success: false,
          message: 'Anda tidak memiliki hak untuk mengubah FAQ lembaga ini.'
        });
      }

      const { category, question, answer, order_index, is_active } = req.body;
      await faqRepo.update(id, {
        category,
        question: question ? question.trim() : undefined,
        answer: answer ? answer.trim() : undefined,
        order_index,
        is_active
      });

      const updated = await faqRepo.findById(id);
      res.json({
        success: true,
        message: 'FAQ berhasil diperbarui.',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteFaq(req, res, next) {
    try {
      const id = parseInt(req.params.id);
      const existing = await faqRepo.findById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'FAQ tidak ditemukan.' });
      }

      const isSuperAdmin = req.user.roles.includes('SUPER_ADMIN');
      if (existing.scope === 'GLOBAL' && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Hanya Super Admin yang dapat menghapus FAQ Global.'
        });
      }

      if (existing.scope === 'INSTITUTION' && !isSuperAdmin && !req.user.institutions.includes(existing.institution_id)) {
        return res.status(403).json({
          success: false,
          message: 'Anda tidak memiliki hak untuk menghapus FAQ lembaga ini.'
        });
      }

      await faqRepo.delete(id);
      res.json({
        success: true,
        message: 'FAQ berhasil dihapus.'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FaqController();
