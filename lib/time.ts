// The current time, for server pages that show what is open right now.
// These pages are rendered per request, so reading the clock is intended.
export function nowMs() {
  return Date.now();
}
