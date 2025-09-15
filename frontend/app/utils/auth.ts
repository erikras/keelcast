import { redirect } from "react-router";
import { createClient } from "./createClient";

/**
 * Helper for route loaders to check authentication and redirect if needed
 */
export async function requireAuth(request: Request) {
  const client = createClient(request);
  const isAuth = await client.auth.isAuthenticated();

  if (isAuth.error || !isAuth.data) {
    const url = new URL(request.url);
    const redirectUrl = encodeURIComponent(url.pathname + url.search);
    throw redirect(`/login?redirect=${redirectUrl}`);
  }

  return client;
}

/**
 * Check if user is authenticated without redirecting
 */
export async function checkAuth(request?: Request) {
  const client = createClient(request);
  const isAuth = await client.auth.isAuthenticated();

  return {
    client,
    isAuthenticated: isAuth.data || false,
    error: isAuth.error,
  };
}
