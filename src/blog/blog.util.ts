/** Strip HTML tags and estimate reading time (200 wpm). */
export function calculateReadingTime(html: string | null | undefined): number {
  if (!html) return 0;
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = text.split(' ').filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
