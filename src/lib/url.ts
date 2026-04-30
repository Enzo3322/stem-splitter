const YOUTUBE_RE =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/;

export function isYouTubeUrl(input: string): boolean {
  return YOUTUBE_RE.test(input.trim());
}
