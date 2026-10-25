// Auth endpoints (section 4, Auth). Each resolves with the response's data.

import { post } from './http.js';

/** -> { user, accessToken } */
export const register = ({ email, password, displayName }) => post('/auth/register', { email, password, displayName });

/** -> { user, accessToken } or { requires2fa: true, loginTicket } */
export const login = ({ email, password }) => post('/auth/login', { email, password });

/** -> { user, accessToken }; INVALID_2FA_CODE carries details.attemptsLeft */
export const loginTwoFactor = ({ loginTicket, code }) => post('/auth/login/2fa', { loginTicket, code });

/** -> { accessToken } */
export const refresh = () => post('/auth/refresh');

/** -> null (204) */
export const logout = () => post('/auth/logout');

/** -> { sent } */
export const resendVerification = () => post('/auth/verify-email/resend');
