import type { Route } from "./+types/auth.callback";
import { redirect } from "react-router";
import { createClient } from "../utils/createClient";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const client = createClient(request);
  const url = new URL(request.url);
  
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const redirectTo = url.searchParams.get("state") || "/";

  if (error) {
    const errorDescription = url.searchParams.get("error_description") || "Authentication failed";
    return redirect(`/login?error=${encodeURIComponent(errorDescription)}`);
  }
  if (!code) {
    return redirect("/login?error=Missing+authorization+code");
  }

  try {
    const authResult = await client.auth.authenticateWithSingleSignOn({ code });
    
    if (authResult.error) {
      return redirect(`/login?error=${encodeURIComponent(authResult.error.message)}`);
    }

    // Get tokens from the auth object where they're actually stored
    const accessToken = client.auth.accessToken().get();
    const refreshToken = client.auth.refreshToken().get();
    
    // Pass tokens via URL for client-side storage
    const redirectUrl = new URL(redirectTo, url.origin);
    if (accessToken && refreshToken) {
      redirectUrl.searchParams.set('access_token', accessToken);
      redirectUrl.searchParams.set('refresh_token', refreshToken);
    }
    
    return redirect(redirectUrl.toString());
  } catch (error) {
    return redirect("/login?error=Authentication+failed");
  }
};

// This route only handles redirects, no component needed
export default function AuthCallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing authentication...</p>
      </div>
    </div>
  );
}
