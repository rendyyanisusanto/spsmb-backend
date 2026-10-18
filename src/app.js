const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const routes = require('./routes')
const errorHandler = require('./middlewares/errorHandler')
const notFound = require('./middlewares/notFound')

const app = express()

// Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim().replace(/\/$/, ''))
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    if (/^https?:\/\/(.*\.)?daftarasy-syadzili\.id$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-continue-token', 'X-Continue-Token']
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Serve static files from storage
const path = require('path');
app.use('/storage', express.static(path.join(__dirname, '../storage')));

// API Routes
app.use('/api/v1', routes)

// 404 Handler
app.use(notFound)

// Global Error Handler
app.use(errorHandler)

module.exports = app
