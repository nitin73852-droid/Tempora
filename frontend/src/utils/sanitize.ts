/**
 * Safely decodes HTML entities (e.g. &#x27;, &quot;, &amp;, &lt;, &gt;) for UI text rendering
 * as a backward-compatible fallback for legacy stored messages,
 * while preserving original plaintext for all new messages.
 */
export function decodeHtmlEntities(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&#47;/g, '/');
}

export default decodeHtmlEntities;
