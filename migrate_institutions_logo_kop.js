const pool = require('./src/config/database');

async function migrate() {
  console.log('--- Checking institutions table for logo_url and kop_url ---');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [colsLogo] = await connection.query("SHOW COLUMNS FROM institutions LIKE 'logo_url'");
    if (colsLogo.length === 0) {
      console.log('Adding logo_url column to institutions...');
      await connection.query(`
        ALTER TABLE institutions
        ADD COLUMN logo_url VARCHAR(500) NULL AFTER gender_scope
      `);
      console.log('+ logo_url added.');
    } else {
      console.log('= logo_url already exists, skipped.');
    }

    const [colsKop] = await connection.query("SHOW COLUMNS FROM institutions LIKE 'kop_url'");
    if (colsKop.length === 0) {
      console.log('Adding kop_url column to institutions...');
      await connection.query(`
        ALTER TABLE institutions
        ADD COLUMN kop_url VARCHAR(500) NULL AFTER logo_url
      `);
      console.log('+ kop_url added.');
    } else {
      console.log('= kop_url already exists, skipped.');
    }

    await connection.commit();
    console.log('--- Migration institutions completed successfully ---');
  } catch (err) {
    await connection.rollback();
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
