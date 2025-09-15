import type { Route } from "./+types/play";
import { Link, useLoaderData } from "react-router";
import { requireAuth } from "../utils/auth";
import AudioPlayer from "../components/AudioPlayer";
import { useListenedEpisode } from "../hooks/useListenedEpisode";
import { createClient } from "../utils/createClient";
import { useMemo } from "react";

export async function loader({ params, request }: Route.LoaderArgs) {
  const client = await requireAuth(request);

  const episodeId = params.episodeId;
  
  if (!episodeId) {
    throw new Response("Episode ID is required", { status: 400 });
  }

  try {
    // Get episode details
    const episodeResponse = await client.api.queries.getEpisode({ id: episodeId });
    
    if (!episodeResponse.data) {
      throw new Response("Episode not found", { status: 404 });
    }

    const episode = episodeResponse.data;

    // Check if URL looks like an audio file
    const isAudioFile = /\.(mp3|m4a|wav|ogg|aac|flac)(\?.*)?$/i.test(episode.audioUrl);

    // Get podcast details
    const podcastResponse = await client.api.queries.podcast({ id: episode.podcastId });
    
    if (!podcastResponse.data) {
      throw new Response("Podcast not found", { status: 404 });
    }

    const podcast = podcastResponse.data;

    return { 
      episode,
      podcast
    };
  } catch (error) {
    throw new Response("Failed to load episode", { status: 500 });
  }
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.episode) {
    return [{ title: "Episode Not Found - KeelCast" }];
  }

  return [
    { title: `${data.episode.title} - KeelCast` },
    { name: "description", content: data.episode.description || `Listen to ${data.episode.title}` },
  ];
}

export default function Play({ loaderData }: Route.ComponentProps) {
  const { episode, podcast } = useLoaderData<typeof loader>();
  
  // Create a stable client instance using useMemo
  const client = useMemo(() => createClient(), []);
  
  const { updateProgress, markComplete } = useListenedEpisode({
    client,
    episodeId: episode.id
  });

  // Progress tracking callbacks
  const handleProgress = (seconds: number) => {
    updateProgress(seconds);
  };

  const handleComplete = () => {
    markComplete();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-xl font-bold text-gray-900">
                KeelCast
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                ← Back to Episodes
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          {/* Episode Header */}
          <div className="mb-8">
            <div className="flex items-start space-x-4 mb-4">
              {podcast.imageUrl && (
                <img
                  src={podcast.imageUrl}
                  alt={`${podcast.title} artwork`}
                  className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  {episode.title}
                </h1>
                <p className="text-lg text-gray-600 mb-2">
                  {podcast.title}
                </p>
                <p className="text-sm text-gray-500">
                  {new Date(episode.publishedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                  {episode.durationSeconds && (
                    <> • {Math.floor(episode.durationSeconds / 60)} minutes</>
                  )}
                </p>
              </div>
            </div>

            {episode.description && (
              <div className="prose max-w-none">
                <p className="text-gray-700 leading-relaxed">
                  {episode.description}
                </p>
              </div>
            )}
          </div>

          {/* Audio Player */}
          <div className="mb-8">
            <AudioPlayer
              source={episode.audioUrl}
              title={episode.title}
              art={podcast.imageUrl}
              duration={episode.durationSeconds || 0}
              width={750}
              autoplay={false}
              preload={true}
              background="#ffffff"
              color="#1f2937"
              progressBarBackground="#e5e7eb"
              progressBarCompleteBackground="#3b82f6"
              className="shadow-lg"
              skipBackSeconds={15}
              skipForwardSeconds={30}
              onProgress={handleProgress}
              onComplete={handleComplete}
            />
          </div>

          {/* Additional Episode Info */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              About this episode
            </h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Podcast</dt>
                <dd className="mt-1 text-sm text-gray-900">{podcast.title}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Published</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(episode.publishedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </dd>
              </div>
              {episode.durationSeconds && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Duration</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {Math.floor(episode.durationSeconds / 60)} minutes
                  </dd>
                </div>
              )}
              {podcast.author && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Author</dt>
                  <dd className="mt-1 text-sm text-gray-900">{podcast.author}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </main>
    </div>
  );
}
