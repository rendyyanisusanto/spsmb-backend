const successResponse = (res, statusCode = 200, message = 'Berhasil.', data = null) => {
  const response = {
    success: true,
    message
  }
  if (data) {
    response.data = data
  }
  return res.status(statusCode).json(response)
}

const successListResponse = (res, statusCode = 200, message = 'Berhasil.', data = [], meta = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta
  })
}

const errorResponse = (res, statusCode = 500, message = 'Terjadi kesalahan.', errors = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors
  })
}

module.exports = {
  successResponse,
  successListResponse,
  errorResponse
}
