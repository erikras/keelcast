import { useEffect, useState } from "react";
import { checkAuth } from "../utils/auth";
import { setCookie, clearAuthCookies } from "../utils/cookies";

interface UseAuthOptions {
  initialAuth?: boolean;
}

export function useAuth({ initialAuth = false }: UseAuthOptions = {}) {
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuth);
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);

    // Check if we have tokens in URL (from OAuth callback)
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');

    if (accessToken && refreshToken) {
      // Set cookies on the correct domain
      setCookie('keel_access_token', accessToken);
      setCookie('keel_refresh_token', refreshToken);

      // Clean up URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('access_token');
      newUrl.searchParams.delete('refresh_token');
      window.history.replaceState({}, '', newUrl.toString());

      // Small delay then reload to pick up the new cookies
      setTimeout(() => {
        window.location.reload();
      }, 100);
      return;
    }

    // Check auth state after hydration
    checkAuth()
      .then(({ isAuthenticated: clientAuth }) => {
        setIsAuthenticated(clientAuth);
        setIsLoading(false);
      })
      .catch((error) => {
        setIsAuthenticated(false);
        setIsLoading(false);
      });
  }, []);

  const logout = async () => {
    setIsLoading(true);

    // Clear cookies first
    clearAuthCookies();

    try {
      const { client } = await checkAuth();
      await client.auth.logout();
      setIsAuthenticated(false);
      window.location.reload();
    } catch (error) {
      // Force reload even if logout fails
      window.location.reload();
    }
  };

  // Use server-side auth state until hydrated, then use client-side
  const effectiveAuthState = isHydrated ? isAuthenticated : initialAuth;

  return {
    isAuthenticated: effectiveAuthState,
    isLoading: isHydrated ? isLoading : false,
    isHydrated,
    logout,
  };
}
