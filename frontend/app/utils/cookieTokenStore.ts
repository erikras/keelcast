import type { TokenStore } from '../../keelClient';

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    if (name && rest.length) {
      cookies[name.trim()] = decodeURIComponent(rest.join('='));
    }
  });
  return cookies;
}

export class CookieTokenStore implements TokenStore {
  private key: string;
  private request?: Request;

  constructor(key: string, request?: Request) {
    this.key = key;
    this.request = request;
  }

  get(): string | null {
    if (typeof window !== 'undefined') {
      // Client-side: read from document.cookie
      const cookies = parseCookies(document.cookie);
      return cookies[this.key] || null;
    } else if (this.request) {
      // Server-side: read from request headers
      const cookieHeader = this.request.headers.get('Cookie') || '';
      const cookies = parseCookies(cookieHeader);
      return cookies[this.key] || null;
    }
    return null;
  }

  set(token: string | null): void {
    if (typeof window !== 'undefined') {
      // Client-side: set document.cookie
      if (token === null) {
        document.cookie = `${this.key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax; Secure`;
      } else {
        const maxAge = 60 * 60 * 24 * 30; // 30 days
        document.cookie = `${this.key}=${encodeURIComponent(token)}; max-age=${maxAge}; path=/; SameSite=Lax; Secure`;
      }
    } else {
      // Server-side: no-op; actual cookie setting happens during auth flow
    }
  }
}
