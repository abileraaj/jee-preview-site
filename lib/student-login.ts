// Students log in with their mobile number and a password. Supabase's
// email + password login is used underneath: each mobile number maps to an
// internal address like 919876543210@login.testnex.app. No email is ever
// sent to it and nobody sees it.
export const STUDENT_LOGIN_DOMAIN = "login.testnex.app";
export const MIN_PASSWORD = 6;

// Accepts 9876543210, +91 98765 43210, 09876543210 etc. Returns the
// 10-digit number, or null if it is not a valid Indian mobile number.
export function normalizeMobile(input: string): string | null {
  let digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function mobileToLoginEmail(mobile10: string) {
  return `91${mobile10}@${STUDENT_LOGIN_DOMAIN}`;
}

export function isMobileLogin(email: string | null | undefined) {
  return Boolean(email && email.endsWith(`@${STUDENT_LOGIN_DOMAIN}`));
}
