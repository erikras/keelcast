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

export class HybridTokenStore implements TokenStore {
  private key: string;
  private request?: Request;
  private memoryStore: string | null = null; // In-memory backup for server-side

  constructor(key: string, request?: Request) {
    this.key = key;
    this.request = request;
  }

  get(): string | null {
    // First check memory store (for tokens set during this request)
    if (this.memoryStore) {
      return this.memoryStore;
    }

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
    // Always store in memory for immediate availability
    this.memoryStore = token;

    if (typeof window !== 'undefined') {
      // Client-side: also set document.cookie
      if (token === null) {
        document.cookie = `${this.key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
      } else {
        const maxAge = 60 * 60 * 24 * 30; // 30 days
        document.cookie = `${this.key}=${encodeURIComponent(token)}; max-age=${maxAge}; path=/; SameSite=Lax`;
      }
    }
  }

  // Method to get the current token for setting cookies
  getCurrentToken(): string | null {
    return this.memoryStore || this.get();
  }
}
