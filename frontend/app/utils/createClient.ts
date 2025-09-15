import { APIClient } from '../../keelClient';
import { HybridTokenStore } from './hybridTokenStore';

// Extend APIClient interface to include our token stores
interface ExtendedAPIClient extends APIClient {
  accessTokenStore: HybridTokenStore;
  refreshTokenStore: HybridTokenStore;
}

export const createClient = (request?: Request): ExtendedAPIClient => {
  // Use environment variable on server, fallback to localhost for client
  const baseUrl = typeof process !== 'undefined' && process.env?.KEEL_API_URL
    ? process.env.KEEL_API_URL
    : 'http://localhost:8000/api';

  // Use hybrid token storage (memory + cookies)
  const accessTokenStore = new HybridTokenStore('keel_access_token', request);
  const refreshTokenStore = new HybridTokenStore('keel_refresh_token', request);

  const client = new APIClient({
    baseUrl,
    accessTokenStore,
    refreshTokenStore,
  }) as ExtendedAPIClient;

  // Expose token stores for cookie setting
  client.accessTokenStore = accessTokenStore;
  client.refreshTokenStore = refreshTokenStore;

  // FORCE the client to use our token stores if it's not using them
  if (client.auth.accessToken.constructor.name === 'InMemoryStore') {
    (client.auth as any).accessToken = accessTokenStore;
    (client.auth as any).refreshToken = refreshTokenStore;
  }

  return client;
};