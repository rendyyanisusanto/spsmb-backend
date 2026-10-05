
const pool = require('../config/database');

class PublicRegistrationController {
  async getCurrentPeriod(req, res, next) {
    try {
      // settings
      const [[settings]] = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'registration.enabled' LIMIT 1");
      const isRegistrationEnabled = settings ? settings.setting_value === 'true' : true;

      // active period
      const [periods] = await pool.query('SELECT p.*, a.id as academic_year_id, a.name as academic_year_name FROM admission_periods p LEFT JOIN academic_years a ON p.academic_year = a.id WHERE p.is_active = 1 LIMIT 1');
      
      let data = {
        academicYear: null,
        period: null,
        wave: null,
        registrationOpen: false
      };

      if (periods.length > 0) {
        const p = periods[0];
        data.academicYear = { id: p.academic_year_id, name: p.academic_year_name };
        data.period = { id: p.id, name: p.name, startDate: p.start_date, endDate: p.end_date };
        
        // now filter by current date to check if it's open, and find active wave
        const nowStr = new Date().toISOString().split('T')[0];
        
        const [waves] = await pool.query('SELECT * FROM admission_waves WHERE admission_period_id = ? AND is_active = 1 AND start_date <= ? AND end_date >= ? LIMIT 1', [p.id, nowStr, nowStr]);
        
        const inPeriod = nowStr >= new Date(p.start_date).toISOString().split('T')[0] && nowStr <= new Date(p.end_date).toISOString().split('T')[0];
        
        if (waves.length > 0) {
          const w = waves[0];
          data.wave = { id: w.id, name: w.name, startDate: w.start_date, endDate: w.end_date };
          if (isRegistrationEnabled && inPeriod) {
            data.registrationOpen = true;
          }
        }
      }
      
      res.json({ success: true, message: 'Data berhasil dimuat', data });
    } catch (err) { next(err); }
  }
}
module.exports = new PublicRegistrationController();
