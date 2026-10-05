const { errorResponse } = require('../utils/response')

const errorHandler = (err, req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.error('[Error Details]:', err)
  }

  // Handle custom thrown errors (e.g. { status: 400, message: "..." })
  if (err.status) {
    return errorResponse(res, err.status, err.message, err.errors || null)
  }

  // Handle specific errors (e.g., Validation Error)
  if (err.name === 'ValidationError') {
    return errorResponse(res, 422, 'Data tidak valid.', err.errors)
  }

  // Default response
  return errorResponse(res, 500, 'Terjadi kesalahan pada server.')
}

module.exports = errorHandler
