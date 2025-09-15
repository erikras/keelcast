'use client';

import { useEffect, useState } from 'react';

interface AudioPlayerProps {
  source: string;
  title: string;
  art?: string | null;
  duration?: number;
  width?: string | number;
  autoplay?: boolean;
  preload?: boolean;
  // Additional styling props for better customization
  background?: string;
  color?: string;
  progressBarBackground?: string;
  progressBarCompleteBackground?: string;
  className?: string;
  skipBackSeconds?: number;
  skipForwardSeconds?: number;
  // Progress tracking callbacks
  onProgress?: (secondsListened: number) => void;
  onComplete?: () => void;
}

export default function AudioPlayer({
  source,
  title,
  art,
  duration = 0,
  width = "100%",
  autoplay = false,
  preload = true,
  background = "#ffffff",
  color = "#1f2937", // gray-800
  progressBarBackground = "#e5e7eb", // gray-200
  progressBarCompleteBackground = "#3b82f6", // blue-500
  className = "",
  skipBackSeconds = 15,
  skipForwardSeconds = 30,
  onProgress,
  onComplete
}: AudioPlayerProps) {
  // Using native HTML5 audio player for reliable progress tracking

  // Validate source URL
  if (!source || source.trim() === '') {
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}>
        <p className="text-red-600 text-sm">
          ⚠️ No audio source available for this episode.
        </p>
      </div>
    );
  }

  return (
      <div 
        className={`rounded-lg shadow-sm border p-6 ${className}`}
        style={{ backgroundColor: background }}
      >
        <div className="flex items-center space-x-4">
          {art && (
            <img
              src={art}
              alt={`${title} artwork`}
              className="w-20 h-20 rounded-lg object-cover flex-shrink-0 shadow-sm"
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 
              className="font-semibold text-lg mb-3 truncate"
              style={{ color }}
            >
              {title}
            </h3>
            <audio
              controls
              preload={preload ? "metadata" : "none"}
              autoPlay={autoplay}
              className="w-full"
              style={{
                height: '40px',
                borderRadius: '6px'
              }}
              onError={() => {}}
              onLoadStart={() => {}}
              onCanPlay={() => {}}
              onTimeUpdate={(e) => {
                const audio = e.target as HTMLAudioElement;
                if (onProgress) {
                  onProgress(Math.floor(audio.currentTime));
                }
              }}
              onEnded={() => {
                if (onComplete) {
                  onComplete();
                }
              }}
            >
              <source src={source} type="audio/mpeg" />
              <source src={source} type="audio/mp4" />
              <source src={source} type="audio/wav" />
              <source src={source} type="audio/ogg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        </div>
      </div>
    );
}
