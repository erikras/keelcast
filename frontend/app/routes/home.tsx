import type { Route } from "./+types/home";
import { useLoaderData, Link } from "react-router";
import { checkAuth } from "../utils/auth";
import { useAuth } from "../hooks/useAuth";
import EpisodeList from "../components/EpisodeList";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "KeelCast - Your Podcast Hub" },
    { name: "description", content: "Manage your podcast subscriptions with KeelCast" },
  ];
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { client, isAuthenticated } = await checkAuth(request);
  
  let message = "Welcome to KeelCast";
  let podcasts: any[] = [];
  
  if (isAuthenticated) {
    const result = await client.api.queries.podcasts({
      first: 10,
    });
    if (result.error) {
      message = `Error loading podcasts: ${result.error.message || result.error.type || 'Unknown error'}`;
    } else {
      podcasts = result.data?.results || [];
    }
  }
  
  return {
    isAuthenticated,
    podcasts,
  };
};

export default function Home() {
  const { isAuthenticated: serverAuth, podcasts } = useLoaderData<typeof loader>();
  const { isAuthenticated, isLoading, logout, isHydrated } = useAuth({ initialAuth: serverAuth });

  // Use server auth state until hydrated to prevent hydration mismatch
  const effectiveAuth = isHydrated ? isAuthenticated : serverAuth;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">KeelCast</h1>
            </div>
                 <div className="flex items-center space-x-4">
                   {effectiveAuth && (
                     <Link
                       to="/add"
                       className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                     >
                       Add Podcast
                     </Link>
                   )}
                   {effectiveAuth ? (
                     <button
                       onClick={logout}
                       disabled={isLoading}
                       className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                     >
                       {isLoading ? 'Logging out...' : 'Logout'}
                     </button>
                   ) : (
                     <Link
                       to="/login"
                       className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                     >
                       Sign In
                     </Link>
                   )}
                 </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
                 <div className="text-center">
                   {effectiveAuth ? (
              <div className="mt-8 space-y-12">
                {podcasts.length > 0 ? (
                  <section>
                    <EpisodeList pageSize={20} />
                  </section>
                ) : (
                  <section>
                    <div className="bg-white rounded-lg shadow p-6 max-w-md mx-auto">
                      <p className="text-gray-600 mb-4">Get started by adding your first podcast RSS feed.</p>
                      <Link 
                        to="/add"
                        className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                      >
                        Add Podcast
                      </Link>
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <div className="mt-8">
                <p className="text-gray-600 mb-6">
                  Sign in to manage your podcast subscriptions and track your listening progress.
                </p>
                <Link
                  to="/login"
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
            </main>
          </div>
        );
      }
