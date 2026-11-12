export const ADMIN_EMAILS = Object.freeze(['alessandroferrara01@libero.it']);

export const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function isAllowedAdmin(decoded) {
  return decoded?.email_verified === true && ADMIN_EMAILS.includes(normalizeEmail(decoded.email));
}
