require('dotenv').config()
const app = require('./app')
const pool = require('./config/database')

const PORT = process.env.PORT || 3000

const startServer = async () => {
  try {
    // Test Database Connection
    const connection = await pool.getConnection()
    console.log('Database connected successfully.')
    connection.release()

    const server = app.listen(PORT, () => {
      console.log(`SPSMB API running on port ${PORT}`)
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
      console.log('Database: connected')
    })

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down server...')
      server.close(async () => {
        console.log('HTTP server closed.')
        try {
          await pool.end()
          console.log('Database pool closed.')
          process.exit(0)
        } catch (err) {
          console.error('Error closing database pool', err)
          process.exit(1)
        }
      })
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

  } catch (error) {
    console.error('Database connection failed.', error)
    process.exit(1) // Crash if DB not connected
  }
}

startServer()
