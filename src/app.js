const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const routes = require('./routes')
const errorHandler = require('./middlewares/errorHandler')
const notFound = require('./middlewares/notFound')

const app = express()

// Middlewares
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
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
