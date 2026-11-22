// The one error type the API answers with. A handler that can't do what was
// asked throws an ApiError; middleware/errorHandler.js turns it into the
// section 4 envelope { success: false, error: { code, message, details } } with
// its HTTP status. Nothing else writes error responses.
//
// Section 4's codes: 400 VALIDATION_ERROR and INVALID_2FA_CODE, 401
// UNAUTHENTICATED, 403 FORBIDDEN and KYC_REQUIRED, 404 NOT_FOUND, 409 CONFLICT
// and MARKET_HALTED, 413 PAYLOAD_TOO_LARGE, 422 INSUFFICIENT_BALANCE and
// MARKET_RULES, 423 ACCOUNT_LOCKED, 429 RATE_LIMITED, 503 ENGINE_UNAVAILABLE,
// 500 INTERNAL. The helpers below cover the common ones, as the mock's
// errors.js did; the rest are thrown as new ApiError(status, code, message).

export class ApiError extends Error {
  /**
   * @param {number} status   HTTP status code, e.g. 404
   * @param {string} code     section 4 error code, e.g. 'NOT_FOUND'
   * @param {string} message  a sentence the client can show
   * @param {object} [details] extra facts, such as one entry per invalid field
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, 'VALIDATION_ERROR', message, details);
export const unauthenticated = (message = 'Log in to continue.') => new ApiError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You can\'t do that.') => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (message, details) => new ApiError(409, 'CONFLICT', message, details);
