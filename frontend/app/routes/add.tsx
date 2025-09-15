import type { Route } from "./+types/add";
import { Form, useLoaderData, useActionData, useNavigation, Link } from "react-router";
import { requireAuth } from "../utils/auth";
import { redirect } from "react-router";
import PodcastSearch from "../components/PodcastSearch";

// Types for Apple API responses
interface ApplePodcastChart {
  feed: {
    results: Array<{
      id: string;
      name: string;
      artistName: string;
      artworkUrl100: string;
      artworkUrl600: string;
      url: string;
    }>;
  };
}

interface iTunesLookupResult {
  results: Array<{
    trackId: number;
    trackName: string;
    artistName: string;
    artworkUrl100: string;
    artworkUrl600: string;
    trackViewUrl: string;
    feedUrl?: string;
  }>;
}

interface PopularPodcast {
  id: string;
  name: string;
  artistName: string;
  artworkUrl100: string;
  artworkUrl600: string;
  trackViewUrl: string;
  feedUrl?: string;
}

// Simple in-memory cache
const cache = new Map<string, { data: PopularPodcast[]; timestamp: number }>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Add Podcast - KeelCast" },
    { name: "description", content: "Add a new podcast by RSS feed or browse popular podcasts" },
  ];
}

async function fetchPopularPodcasts(country: string = 'us'): Promise<PopularPodcast[]> {
  const cacheKey = `popular-${country}`;
  const cached = cache.get(cacheKey);
  
  // Check cache
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Step 1: Get top 15 podcast IDs from Apple Charts
    const chartsResponse = await fetch(
      `https://rss.applemarketingtools.com/api/v2/${country}/podcasts/top/15/podcasts.json`
    );
    
    if (!chartsResponse.ok) {
      throw new Error(`Charts API failed: ${chartsResponse.status}`);
    }
    
    const chartsData: ApplePodcastChart = await chartsResponse.json();
    
    // Check if the response has the expected structure
    if (!chartsData.feed || !chartsData.feed.results || !Array.isArray(chartsData.feed.results)) {
      console.error('Unexpected Apple Charts API response structure:', chartsData);
      throw new Error('Invalid response structure from Apple Charts API');
    }
    
    const podcastIds = chartsData.feed.results.map(result => result.id);
    
    // Step 2: Get detailed info including feed URLs from iTunes Lookup
    const lookupResponse = await fetch(
      `https://itunes.apple.com/lookup?id=${podcastIds.join(',')}&entity=podcast`
    );
    
    if (!lookupResponse.ok) {
      throw new Error(`iTunes Lookup API failed: ${lookupResponse.status}`);
    }
    
    const lookupData: iTunesLookupResult = await lookupResponse.json();
    
    // Check if the iTunes response has the expected structure
    if (!lookupData.results || !Array.isArray(lookupData.results)) {
      console.error('Unexpected iTunes Lookup API response structure:', lookupData);
      throw new Error('Invalid response structure from iTunes Lookup API');
    }
    
    // Step 3: Map and enrich the data
    const popularPodcasts: PopularPodcast[] = lookupData.results.map(result => ({
      id: result.trackId.toString(),
      name: result.trackName,
      artistName: result.artistName,
      artworkUrl100: result.artworkUrl100,
      artworkUrl600: result.artworkUrl600,
      trackViewUrl: result.trackViewUrl,
      feedUrl: result.feedUrl,
    }));
    
    // Cache the results
    cache.set(cacheKey, { data: popularPodcasts, timestamp: Date.now() });
    
    return popularPodcasts;
  } catch (error) {
    console.error('Error fetching popular podcasts:', error);
    return [];
  }
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const client = await requireAuth(request);
  
  const url = new URL(request.url);
  const country = url.searchParams.get('country') || 'us';
  
  // Fetch popular podcasts and user subscriptions in parallel
  const [popularPodcasts, subscriptionsResult] = await Promise.all([
    fetchPopularPodcasts(country),
    client.api.queries.mySubscriptions()
  ]);
  
  // Get the RSS URLs of podcasts the user is already subscribed to
  const subscribedRssUrls = new Set<string>();
  if (subscriptionsResult.data?.results) {
    // We need to get the podcast details for each subscription to get the RSS URLs
    const podcastIds = subscriptionsResult.data.results.map(sub => sub.podcastId);
    
    if (podcastIds.length > 0) {
      const podcastsResult = await client.api.queries.podcasts();
      if (podcastsResult.data?.results) {
        const subscribedPodcasts = podcastsResult.data.results.filter(p => 
          podcastIds.includes(p.id)
        );
        subscribedPodcasts.forEach(podcast => {
          if (podcast.rssUrl) {
            subscribedRssUrls.add(podcast.rssUrl);
          }
        });
      }
    }
  }
  
  // Filter out popular podcasts that the user is already subscribed to
  const filteredPopularPodcasts = popularPodcasts.filter(podcast => 
    !podcast.feedUrl || !subscribedRssUrls.has(podcast.feedUrl)
  );
  
  return {
    popularPodcasts: filteredPopularPodcasts,
    country,
    subscribedRssUrls: Array.from(subscribedRssUrls),
  };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const client = await requireAuth(request);
  
  const formData = await request.formData();
  const feedUrl = formData.get('feedUrl') as string;
  
  // Validation
  if (!feedUrl) {
    return {
      error: 'RSS feed URL is required',
      feedUrl: '',
    };
  }
  
  if (!feedUrl.startsWith('http://') && !feedUrl.startsWith('https://')) {
    return {
      error: 'Please enter a valid URL starting with http:// or https://',
      feedUrl,
    };
  }
  
  if (feedUrl.length > 2000) {
    return {
      error: 'URL is too long',
      feedUrl,
    };
  }
  
  try {
    // Create the podcast using the Keel API - validation will happen in the backend
    const result = await client.api.mutations.createPodcast({ rssUrl: feedUrl });
    
    if (result.error) {
      
      // Check for RSS validation errors from the backend
      const errorMessage = result.error.message || 'Failed to create podcast';
      
      // Handle specific RSS validation errors
      if (errorMessage.includes('RSS feed URL is required') ||
          errorMessage.includes('Please enter a valid URL') ||
          errorMessage.includes('URL is too long') ||
          errorMessage.includes('Unable to fetch RSS feed') ||
          errorMessage.includes('does not appear to contain a valid RSS') ||
          errorMessage.includes('RSS feed appears to be malformed') ||
          errorMessage.includes('Unable to connect to the RSS feed') ||
          errorMessage.includes('RSS feed took too long to respond') ||
          errorMessage.includes('Invalid RSS feed structure') ||
          errorMessage.includes('No MP3 URL found') ||
          errorMessage.includes('MP3 URL is not accessible')) {
        return {
          error: errorMessage,
          feedUrl,
        };
      }
      
      // Check if this is a unique constraint error for rssUrl
      if (errorMessage.includes("the value for the unique field 'rssUrl' must be unique")) {
        // Find the existing podcast by rssUrl using list and filter
        const podcastsResult = await client.api.queries.podcasts();
        
        if (podcastsResult.error) {
          return {
            error: 'This podcast already exists, but we could not subscribe you to it. Please try again.',
            feedUrl,
          };
        }
        
        // Find the podcast with matching RSS URL
        const existingPodcast = podcastsResult.data?.results?.find(p => p.rssUrl === feedUrl);
        
        if (existingPodcast) {
          // Create a subscription for the existing podcast
          const subscriptionResult = await client.api.mutations.createSubscription({ 
            podcast: { id: existingPodcast.id } 
          });
          
          if (subscriptionResult.error) {
            
            // Check if user is already subscribed
            if (subscriptionResult.error.message && subscriptionResult.error.message.includes('already exists')) {
              throw redirect('/?info=already-subscribed');
            }
            
            return {
              error: 'Failed to subscribe to the existing podcast. Please try again.',
              feedUrl,
            };
          }
          
          throw redirect('/?success=podcast-subscribed');
        } else {
          return {
            error: 'This podcast already exists, but we could not find it to subscribe you. Please try again.',
            feedUrl,
          };
        }
      }
      
      return {
        error: errorMessage,
        feedUrl,
      };
    }
    
    // Redirect to home with success message
    throw redirect('/?success=podcast-added');
  } catch (error) {
    if (error instanceof Response) {
      throw error; // Re-throw redirects
    }
    
    return {
      error: 'An unexpected error occurred while creating the podcast. Please try again.',
      feedUrl,
    };
  }
};

export default function Add() {
  const { popularPodcasts, country, subscribedRssUrls } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-xl font-semibold text-gray-900">
                KeelCast
              </Link>
            </div>
            <div className="flex items-center">
              <Link
                to="/"
                className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Add a Podcast</h1>
            <p className="text-gray-600">
              Add a podcast by pasting its RSS feed URL, or choose from popular podcasts below.
            </p>
          </div>

          {/* RSS Feed Form */}
          <div className="bg-white rounded-lg shadow p-6 mb-8 max-w-2xl mx-auto">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Add by RSS Feed</h2>
            <Form method="post" className="space-y-4">
              <div>
                <label htmlFor="feedUrl" className="block text-sm font-medium text-gray-700 mb-2">
                  RSS Feed URL
                </label>
                <input
                  type="url"
                  id="feedUrl"
                  name="feedUrl"
                  defaultValue={actionData?.feedUrl || ''}
                  placeholder="https://example.com/podcast/feed.xml"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={isSubmitting}
                />
                {actionData?.error && (
                  <p className="mt-2 text-sm text-red-600" role="alert" aria-live="polite">
                    {actionData.error}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                {isSubmitting ? 'Adding Podcast...' : 'Add Podcast'}
              </button>
            </Form>
          </div>

          {/* Podcast Search and Listing */}
          <PodcastSearch popularPodcasts={popularPodcasts} country={country} subscribedRssUrls={subscribedRssUrls} />
        </div>
      </main>
    </div>
  );
}