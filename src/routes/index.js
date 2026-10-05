const express = require('express')
const router = express.Router()
const pool = require('../config/database')
const { successResponse, errorResponse } = require('../utils/response')
const asyncHandler = require('../utils/asyncHandler')

const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const roleRoutes = require('./roleRoutes');
const institutionRoutes = require('./institutionRoutes');
const settingRoutes = require('./settingRoutes');
const publicRoutes = require('./publicRoutes');
const academicYearRoutes = require('./academicYearRoutes');
const registrationPeriodRoutes = require('./registrationPeriodRoutes');
const registrationWaveRoutes = require('./registrationWaveRoutes');
const programRoutes = require('./programRoutes');
const formRoutes = require('./formRoutes');
const documentRoutes = require('./documentRoutes');
const whatsappTemplateRoutes = require('./whatsappTemplateRoutes');
const applicationRoutes = require('./applicationRoutes');

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/institutions', institutionRoutes);
router.use('/settings', settingRoutes);
router.use('/public', publicRoutes);
router.use('/academic-years', academicYearRoutes);
router.use('/registration-periods', registrationPeriodRoutes);
router.use('/registration-waves', registrationWaveRoutes);
router.use('/programs', programRoutes);
router.use('/', formRoutes);
router.use('/', documentRoutes);
router.use('/whatsapp-templates', whatsappTemplateRoutes);
router.use('/applications', applicationRoutes);

router.get('/health', asyncHandler(async (req, res) => {
  let dbStatus = 'disconnected'
  try {
    const connection = await pool.getConnection()
    await connection.query('SELECT 1')
    connection.release()
    dbStatus = 'connected'
  } catch (error) {
    dbStatus = 'error'
  }

  if (dbStatus === 'connected') {
    return successResponse(res, 200, 'SPSMB API is running', {
      status: 'ok',
      database: dbStatus
    })
  } else {
    return res.status(503).json({
      success: false,
      message: 'SPSMB API is running but database is not connected',
      data: {
        status: 'error',
        database: dbStatus
      }
    })
  }
}))

module.exports = router
