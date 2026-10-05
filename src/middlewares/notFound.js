const { errorResponse } = require('../utils/response')

const notFound = (req, res, next) => {
  return errorResponse(res, 404, 'Endpoint tidak ditemukan.')
}

module.exports = notFound
