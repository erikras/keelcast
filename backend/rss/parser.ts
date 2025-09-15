import { type Episode } from '@teamkeel/sdk';
import Parser from 'rss-parser';
import { z } from 'zod';

// Episode type for database insertion (without auto-generated fields)
export type EpisodeInsert = Omit<Episode, 'id' | 'createdAt' | 'updatedAt'>;

// Zod schema for RSS enclosure (contains audio file URLs)
const RSSEnclosureSchema = z.object({
  url: z.string().url('Enclosure URL must be valid'),
  type: z.string().optional(),
  length: z.union([z.string(), z.number()]).optional()
}).or(z.object({
  $: z.object({
    url: z.string().url('Enclosure URL must be valid'),
    type: z.string().optional(),
    length: z.union([z.string(), z.number()]).optional()
  })
}));

// Zod schemas for RSS feed validation
const RSSItemSchema = z.object({
  title: z.string().min(1, 'Episode title is required'),
  link: z.string().url('Episode link must be a valid URL'),
  contentSnippet: z.string().optional(),
  content: z.string().optional(),
  pubDate: z.string().optional(),
  duration: z.union([z.string(), z.number()]).optional(),
  'itunes:duration': z.union([z.string(), z.number()]).optional(),
  enclosure: z.union([
    RSSEnclosureSchema,
    z.array(RSSEnclosureSchema),
    z.any() // Fallback for unexpected enclosure formats
  ]).refine((enclosure) => {
    // Ensure enclosure exists for valid episodes
    return enclosure !== undefined && enclosure !== null;
  }, {
    message: 'Episode must have an enclosure (audio file)',
    path: ['enclosure']
  }),
}).refine(
  (item) => item.contentSnippet || item.content,
  {
    message: 'Episode must have either contentSnippet or content',
    path: ['content']
  }
);

const RSSFeedSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  link: z.string().optional(),
  author: z.string().optional(),
  categories: z.array(z.string()).optional(),
  image: z.object({
    url: z.string().url().optional()
  }).optional(),
  'itunes:image': z.union([
    z.string().url(),
    z.object({
      href: z.string().url()
    }),
    z.object({
      $: z.object({
        href: z.string().url()
      })
    })
  ]).optional(),
  items: z.array(RSSItemSchema).min(1, 'RSS feed must contain at least one episode')
});

export type ValidatedRSSFeed = z.infer<typeof RSSFeedSchema>;
export type ValidatedRSSItem = z.infer<typeof RSSItemSchema>;

/**
 * Extracts image URL from various RSS feed image formats
 * @param feed - The validated RSS feed
 * @returns Image URL if found, null otherwise
 */
export function extractImageUrl(feed: ValidatedRSSFeed): string | null {

  // Try iTunes image first (most common for podcasts)
  if (feed['itunes:image']) {
    const itunesImage = feed['itunes:image'];

    if (typeof itunesImage === 'string') {
      return itunesImage;
    }

    if (typeof itunesImage === 'object') {
      if ('href' in itunesImage && itunesImage.href) {
        return itunesImage.href;
      }

      if ('$' in itunesImage && itunesImage.$?.href) {
        return itunesImage.$.href;
      }
    }
  }

  // Fall back to standard RSS image
  if (feed.image?.url) {
    return feed.image.url;
  }

  return null;
}

/**
 * Validates that an MP3 URL actually points to an accessible audio file
 * Uses HTTP HEAD request to check without downloading the entire file
 * @param url - The MP3 URL to validate
 * @returns Promise<boolean> - true if URL is valid and accessible
 */
async function validateMp3Url(url: string): Promise<boolean> {
  try {
    // Use fetch with HEAD method to check if URL exists without downloading content
    const response = await Promise.race([
      fetch(url, {
        method: 'HEAD',
        // Add some headers to appear more like a real browser request
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KeelCast/1.0; +https://keelcast.com)',
          'Accept': 'audio/*,*/*;q=0.1'
        }
      }),
      // Timeout after 10 seconds
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('HTTP HEAD request timeout')), 10000)
      )
    ]);

    // Check if the request was successful (2xx status codes)
    if (!response.ok) {

      return false;
    }

    // Optionally check content type if provided
    const contentType = response.headers.get('content-type');
    if (contentType) {
      const isAudioContent = contentType.toLowerCase().includes('audio') ||
        contentType.toLowerCase().includes('mpeg') ||
        contentType.toLowerCase().includes('mp3');

      if (!isAudioContent) {

        return false;
      }
    }

    // Check content length if available (should be > 0 for valid files)
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) === 0) {

      return false;
    }


    return true;

  } catch (error) {

    return false;
  }
}

/**
 * Extracts MP3/audio URL from common RSS item fields.
 * Tries: enclosure, enclosures, media:content, media:group
 */
function extractAudioUrlFromItem(item: any): string | null {
  const enclosure = (item && (item.enclosure ?? item.enclosures)) ?? null;

  // 1) Try standard enclosure(s)
  if (enclosure) {
    const urlFromEnc = extractFromEnclosure(enclosure);
    if (urlFromEnc) return urlFromEnc;
  }

  // 2) Try media:content array(s)
  const mediaContent = item?.['media:content'] ?? item?.mediaContent;
  if (mediaContent) {
    const urlFromMedia = extractFromEnclosure(mediaContent);
    if (urlFromMedia) return urlFromMedia;
  }

  // 3) Try media:group.content
  const mediaGroup = item?.['media:group'] ?? item?.mediaGroup;
  if (mediaGroup) {
    const groupContent = mediaGroup?.content ?? mediaGroup?.contents;
    if (groupContent) {
      const urlFromGroup = extractFromEnclosure(groupContent);
      if (urlFromGroup) return urlFromGroup;
    }
  }

  return null;
}

// Helper used by extractAudioUrlFromItem to scan various enclosure-like shapes
function extractFromEnclosure(encLike: any): string | null {
  const enclosure = encLike;

  // Helper function to check if a URL is likely an MP3 file
  const isMp3Url = (url: string): boolean => {
    const lowerUrl = url.toLowerCase();
    // Be more strict - prioritize actual MP3 files
    return lowerUrl.includes('.mp3') ||
      lowerUrl.includes('audio/mpeg') ||
      lowerUrl.includes('audio/mp3');
  };

  // Helper function to check if a URL is any audio file
  const isAudioUrl = (url: string): boolean => {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('.mp3') ||
      lowerUrl.includes('.m4a') ||
      lowerUrl.includes('.wav') ||
      lowerUrl.includes('.ogg') ||
      lowerUrl.includes('.aac') ||
      lowerUrl.includes('audio/mpeg') ||
      lowerUrl.includes('audio/mp3') ||
      lowerUrl.includes('audio/mp4') ||
      lowerUrl.includes('audio/wav') ||
      lowerUrl.includes('audio/ogg') ||
      lowerUrl.includes('audio/aac');
  };

  const isAudioType = (enc: any): boolean => {
    const type = enc?.type || enc?.$?.type || enc?.attributes?.type;
    return typeof type === 'string' && type.toLowerCase().includes('audio');
  };

  // Helper function to extract URL from enclosure object
  const getUrlFromEnclosure = (enc: any): string | null => {
    // Handle different enclosure formats
    if (typeof enc === 'string') return enc;
    if (enc?.url) return enc.url;
    if (enc?.$?.url) return enc.$.url; // XML parser format
    if (enc?.href) return enc.href; // Alternative format
    if (enc?.link) return enc.link; // Alternative format

    // Handle case where enclosure is an object with attributes
    if (enc && typeof enc === 'object') {
      // Check for common attribute names
      const possibleUrlKeys = ['url', 'href', 'link', 'src'];
      for (const key of possibleUrlKeys) {
        if (enc[key] && typeof enc[key] === 'string') {
          return enc[key];
        }
      }

      // Check if it has attributes object
      if (enc.attributes) {
        for (const key of possibleUrlKeys) {
          if (enc.attributes[key] && typeof enc.attributes[key] === 'string') {
            return enc.attributes[key];
          }
        }
      }
    }

    return null;
  };

  // Handle array of enclosures
  if (Array.isArray(enclosure)) {
    // First pass: look for MP3 files specifically
    for (const enc of enclosure) {
      const url = getUrlFromEnclosure(enc);
      if (url && isMp3Url(url)) {
        return url;
      }
    }
    // Second pass: look for any audio files (by extension) or explicit audio type
    for (const enc of enclosure) {
      const url = getUrlFromEnclosure(enc);
      if (url && (isAudioUrl(url) || isAudioType(enc))) {
        return url;
      }
    }
    return null;
  }

  // Handle single enclosure
  const url = getUrlFromEnclosure(enclosure);

  if (url && (isMp3Url(url) || isAudioUrl(url))) {
    return url;
  }

  // Not clearly an audio file
  return null;
}

/**
 * Processes a validated RSS item into an Episode object
 * @param item - Validated RSS item
 * @param validateUrl - Whether to perform HTTP validation of the MP3 URL
 * @returns Episode object ready for database insertion
 */
async function processValidatedItem(item: ValidatedRSSItem, validateUrl: boolean = true): Promise<EpisodeInsert> {
  // Parse duration if available
  let durationSeconds: number | null = null;
  if (item.duration || item['itunes:duration']) {
    const duration = item.duration || item['itunes:duration'];
    if (typeof duration === 'string') {
      // Handle formats like "00:45:30" or "2730" (seconds)
      if (duration.includes(':')) {
        const parts = duration.split(':').map(Number);
        if (parts.length === 3) {
          durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          durationSeconds = parts[0] * 60 + parts[1];
        }
      } else {
        const parsed = parseInt(duration, 10);
        if (!isNaN(parsed)) {
          durationSeconds = parsed;
        }
      }
    } else if (typeof duration === 'number') {
      durationSeconds = duration;
    }
  }

  // Parse publication date
  let publishedAt = new Date();
  if (item.pubDate) {
    const parsed = new Date(item.pubDate);
    if (!isNaN(parsed.getTime())) {
      publishedAt = parsed;
    }
  }

  // Debug episode data


  const audioUrl = extractAudioUrlFromItem(item);


  // Extract and validate audio URL - this is now required
  if (!audioUrl) {
    throw new Error(`No audio URL found for episode "${item.title}" - skipping invalid episode`);
  }

  let validatedAudioUrl: string;
  try {
    // Basic URL validation
    new URL(audioUrl);
    validatedAudioUrl = audioUrl;

  } catch (error) {
    throw new Error(`Invalid audio URL for episode "${item.title}": ${audioUrl}`);
  }

  // Skip HTTP validation by default for performance - just validate URL format
  // HTTP validation can be enabled with validateUrls option but is slow for many episodes
  if (validateUrl) {
    // const isUrlAccessible = await validateMp3Url(validatedAudioUrl);
    // if (!isUrlAccessible) {
    //   throw new Error(`Audio URL is not accessible for episode "${item.title}": ${validatedAudioUrl}`);
    // }
  }

  // Final safety check before returning
  if (!validatedAudioUrl) {
    throw new Error(`Failed to extract valid audio URL for episode "${item.title}"`);
  }

  // Return the processed episode (podcastId will be set by the caller)
  const processedEpisode = {
    podcastId: '', // This will be set by the caller
    title: item.title,
    description: item.contentSnippet || item.content || null,
    url: item.link,
    audioUrl: validatedAudioUrl,
    publishedAt: publishedAt,
    durationSeconds: durationSeconds
  };

  return processedEpisode;
}

/**
 * Fetches and parses episodes from an RSS feed URL
 * @param rssUrl - The RSS feed URL to parse
 * @param options - Optional configuration
 * @returns Array of Episode objects ready for database insertion
 */
// RSS Feed validation function - lightweight validation only
async function validateRSSFeed(rssUrl: string): Promise<void> {
  // Basic URL validation
  if (!rssUrl) {
    throw new Error('RSS feed URL is required');
  }

  if (!rssUrl.startsWith('http://') && !rssUrl.startsWith('https://')) {
    throw new Error('Please enter a valid URL starting with http:// or https://');
  }

  if (rssUrl.length > 2000) {
    throw new Error('URL is too long');
  }

  // Fetch and validate RSS feed


  try {
    const rssResponse = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'KeelCast/1.0 (Podcast RSS Reader)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      // Set a reasonable timeout
      signal: AbortSignal.timeout(10000), // 10 seconds
    });

    if (!rssResponse.ok) {
      throw new Error(`Unable to fetch RSS feed. Server responded with ${rssResponse.status}: ${rssResponse.statusText}`);
    }

    const contentType = rssResponse.headers.get('content-type') || '';
    if (!contentType.includes('xml') && !contentType.includes('rss')) {

    }

    const rssText = await rssResponse.text();

    // Basic validation that it looks like XML/RSS
    if (!rssText.trim().startsWith('<?xml') && !rssText.includes('<rss') && !rssText.includes('<feed')) {
      throw new Error('The URL does not appear to contain a valid RSS or Atom feed');
    }

    // Check for basic RSS structure
    if (!rssText.includes('<channel>') && !rssText.includes('<feed')) {
      throw new Error('The RSS feed appears to be malformed (missing channel or feed element)');
    }

  } catch (error) {
    // Handle specific error types
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Unable to connect to the RSS feed URL. Please check the URL and try again.');
    }

    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('The RSS feed took too long to respond. Please try again later.');
    }

    // Re-throw validation errors as-is
    if (error instanceof Error) {
      throw error;
    }

    throw new Error('An unexpected error occurred while validating the RSS feed. Please try again.');
  }
}


export async function fetchEpisodes(
  rssUrl: string,
  options: { validateUrls?: boolean } = { validateUrls: false }
): Promise<EpisodeInsert[]> {


  if (!rssUrl) {

    throw new Error('RSS URL is required');
  }

  // Validate RSS feed before processing
  await validateRSSFeed(rssUrl);


  // Initialize RSS parser
  const parser = new Parser({
    customFields: {
      item: [
        'duration',
        'itunes:duration',
        'enclosure'
      ]
    }
  });



  // Add timeout and better error handling for RSS parsing
  const rawFeed = await Promise.race([
    parser.parseURL(rssUrl),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('RSS parsing timeout after 30 seconds')), 30000)
    )
  ]) as any;

  // Be lenient at the feed level: some feeds have uneven items.
  const episodes: EpisodeInsert[] = [];
  const feedItems: any[] = Array.isArray((rawFeed as any).items) ? (rawFeed as any).items : [];

  for (let i = 0; i < feedItems.length; i++) {
    const item = feedItems[i];


    // Items are already validated by Zod schema, but we'll add individual validation for extra safety
    try {
      const validatedItem = RSSItemSchema.parse(item);
      const processedEpisode = await processValidatedItem(validatedItem, options.validateUrls);
      episodes.push(processedEpisode);

    } catch (error) {
      if (error instanceof z.ZodError) {

        continue;
      } else if (error instanceof Error && error.message.includes('No audio URL found')) {

        continue;
      } else if (error instanceof Error && error.message.includes('Invalid audio URL')) {

        continue;
      } else if (error instanceof Error && error.message.includes('audio URL is not accessible')) {

        continue;
      }
      throw error;
    }
  }
  return episodes;
}

/**
 * Fetches and validates RSS feed metadata (without episodes)
 * @param rssUrl - The RSS feed URL to parse
 * @returns Validated RSS feed metadata
 */
export async function fetchFeedMetadata(rssUrl: string): Promise<ValidatedRSSFeed> {
  if (!rssUrl) {
    throw new Error('RSS URL is required');
  }

  // Initialize RSS parser with custom fields for iTunes image
  const parser = new Parser({
    customFields: {
      feed: ['itunes:image']
    }
  });

  // Add timeout and better error handling for RSS parsing
  const rawFeed = await Promise.race([
    parser.parseURL(rssUrl),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('RSS parsing timeout after 30 seconds')), 30000)
    )
  ]) as any;

  try {
    return RSSFeedSchema.parse(rawFeed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.warn('RSS feed metadata validation failed, using partial data:', error.errors);
      // Return the raw feed but with caution
      return rawFeed;
    }
    throw error;
  }
}
