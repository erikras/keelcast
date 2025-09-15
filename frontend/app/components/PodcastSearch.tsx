import { useState, useMemo, useCallback, useEffect } from "react";
import { Form, useNavigation } from "react-router";
import { useDebounced } from "../hooks/useDebounced";

// Types for Apple API responses
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

// Search Apple's API for podcasts
async function searchApplePodcasts(query: string): Promise<PopularPodcast[]> {
  if (!query.trim()) return [];
  
  try {
    const searchResponse = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=podcast&limit=20`
    );
    
    if (!searchResponse.ok) {
      throw new Error(`Apple Search API failed: ${searchResponse.status}`);
    }
    
    const searchData: iTunesLookupResult = await searchResponse.json();
    
    if (!searchData.results || !Array.isArray(searchData.results)) {
      return [];
    }
    
    return searchData.results.map(result => ({
      id: result.trackId.toString(),
      name: result.trackName,
      artistName: result.artistName,
      artworkUrl100: result.artworkUrl100,
      artworkUrl600: result.artworkUrl600,
      trackViewUrl: result.trackViewUrl,
      feedUrl: result.feedUrl,
    }));
  } catch (error) {
    return [];
  }
}

interface PodcastSearchProps {
  popularPodcasts: PopularPodcast[];
  country: string;
  subscribedRssUrls?: string[];
}

export default function PodcastSearch({ popularPodcasts, country, subscribedRssUrls = [] }: PodcastSearchProps) {
  const navigation = useNavigation();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PopularPodcast[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  const debouncedSearchQuery = useDebounced(searchQuery, 500);
  
  const isSubmitting = navigation.state === "submitting";
  
  // Get the feedUrl being submitted from the form data
  const submittingFeedUrl = navigation.formData?.get("feedUrl") as string;

  // Perform search when debounced query changes
  useEffect(() => {
    if (!debouncedSearchQuery.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      setSearchError(null);
      
      try {
        const results = await searchApplePodcasts(debouncedSearchQuery);
        setSearchResults(results);
      } catch (error) {
        setSearchError('Failed to search podcasts. Please try again.');
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearchQuery]);

  // Show search results if searching, otherwise show popular podcasts
  const displayedPodcasts = searchQuery.trim() ? searchResults : popularPodcasts;
  const isShowingSearchResults = searchQuery.trim().length > 0;

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
  }, []);

  // Helper function to check if a podcast is already subscribed
  const isSubscribed = useCallback((feedUrl?: string) => {
    return feedUrl ? subscribedRssUrls.includes(feedUrl) : false;
  }, [subscribedRssUrls]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {isShowingSearchResults ? 'Search Results' : 'Popular Podcasts'}
        </h2>
        {!isShowingSearchResults && (
          <div className="text-sm text-gray-500">
            Showing top podcasts from {country.toUpperCase()}
          </div>
        )}
      </div>

      {/* Search Box */}
      <div className="mb-6 max-w-md mx-auto">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {isSearching ? (
              <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>
          <input
            type="text"
            placeholder="Search podcasts by name or author..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        
        {/* Search Status */}
        {searchError && (
          <p className="mt-2 text-sm text-red-600 text-center">
            {searchError}
          </p>
        )}
        
        {isShowingSearchResults && !isSearching && !searchError && (
          <p className="mt-2 text-sm text-gray-600 text-center">
            {displayedPodcasts.length === 0 
              ? `No podcasts found for "${debouncedSearchQuery}"`
              : `Found ${displayedPodcasts.length} podcast${displayedPodcasts.length === 1 ? '' : 's'} for "${debouncedSearchQuery}"`
            }
          </p>
        )}
        
        {isSearching && (
          <p className="mt-2 text-sm text-gray-500 text-center">
            Searching for "{debouncedSearchQuery}"...
          </p>
        )}
      </div>

      {popularPodcasts.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-600">
            Unable to load popular podcasts at the moment. You can still add podcasts using the RSS feed form above.
          </p>
        </div>
      ) : displayedPodcasts.length === 0 && debouncedSearchQuery ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-gray-600 mb-2">No podcasts found for "{debouncedSearchQuery}"</p>
          <p className="text-sm text-gray-500">Try searching with different keywords or browse all popular podcasts below.</p>
          <button
            onClick={clearSearch}
            className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displayedPodcasts.map((podcast) => (
            <div key={podcast.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="p-4">
                <div className="text-center">
                  <img
                    src={podcast.artworkUrl600 || podcast.artworkUrl100}
                    alt={`${podcast.name} artwork`}
                    className="w-32 h-32 mx-auto rounded-lg mb-3 object-cover"
                    loading="lazy"
                  />
                  <h3 className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">
                    {podcast.name}
                  </h3>
                  <p className="text-xs text-gray-600 line-clamp-1 mb-4">
                    by {podcast.artistName}
                  </p>
                  
                  {podcast.feedUrl ? (
                    isSubscribed(podcast.feedUrl) ? (
                      <div className="w-full bg-green-100 text-green-800 px-3 py-2 rounded text-sm font-medium text-center border border-green-200">
                        ✓ Subscribed
                      </div>
                    ) : (
                      <Form method="post">
                        <input type="hidden" name="feedUrl" value={podcast.feedUrl} />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-3 py-2 rounded text-sm font-medium transition-colors"
                        >
                          {isSubmitting && submittingFeedUrl === podcast.feedUrl ? 'Adding...' : 'Add Podcast'}
                        </button>
                      </Form>
                    )
                  ) : (
                    <a
                      href={podcast.trackViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-sm font-medium text-center transition-colors"
                    >
                      View on Apple
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
