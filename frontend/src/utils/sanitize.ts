export const sanitizeText = (str: string): string => {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, '').trim();
};

export const decodeHtmlEntities = (text: string): string => {
  if (!text) return '';
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x2F;': '/',
  };
  return text.replace(/&(?:amp|lt|gt|quot|#39|#x2F);/g, (match) => entities[match] || match);
};
