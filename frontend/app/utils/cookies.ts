export function setCookie(name: string, value: string, maxAge: number = 60 * 60 * 24 * 30) {
  if (typeof window === 'undefined') return;

  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

export function deleteCookie(name: string) {
  if (typeof window === 'undefined') return;

  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  if (typeof window === 'undefined') return null;

  const cookies = document.cookie.split(';');
  const cookie = cookies.find(c => c.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
}

export function clearAuthCookies() {
  deleteCookie('keel_access_token');
  deleteCookie('keel_refresh_token');
}
