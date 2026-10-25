// Errors the mock server returns, with the codes and statuses of section 4.

export class MockError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new MockError(400, 'VALIDATION_ERROR', message, details);
export const unauthenticated = (message = 'Log in to continue.') => new MockError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You can\'t do that.') => new MockError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new MockError(404, 'NOT_FOUND', message);
export const conflict = (message, details) => new MockError(409, 'CONFLICT', message, details);
