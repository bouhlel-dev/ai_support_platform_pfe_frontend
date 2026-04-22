export type MailLikeActionLink = {
  label: string;
  url: string;
};

export type MailLikeDisplay = {
  preview: string;
  textLines: string[];
  actionLinks: MailLikeActionLink[];
};

const URL_REGEX = /(https?:\/\/[^\s<>")\]]+)/g;
const FOOTER_SEPARATOR_REGEX = /^-{8,}\s*$/;
const TRAILING_PUNCTUATION_REGEX = /[),.;!?]+$/;
const TRACKING_QUERY_KEYS = new Set([
  'trk',
  'trkemail',
  'lipi',
  'midtoken',
  'midsig',
  'eid',
  'otptoken',
  'loid',
  'upsellorderorigin',
  'referenceid',
  'isss',
  'origin',
]);

function decodeQuotedPrintable(content: string) {
  const withoutSoftBreaks = content.replace(/=\r?\n/g, '');
  return withoutSoftBreaks.replace(/=([0-9A-F]{2})/gi, (_m, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

function htmlToPlainText(content: string) {
  if (!/<[a-z][\s\S]*>/i.test(content)) {
    return content;
  }

  return content
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr|section|article)\s*>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function sanitizeTrackingUrl(rawUrl: string) {
  const trimmed = rawUrl.replace(TRAILING_PUNCTUATION_REGEX, '');
  const trailing = rawUrl.slice(trimmed.length);

  try {
    const parsed = new URL(trimmed);
    for (const key of Array.from(parsed.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (TRACKING_QUERY_KEYS.has(lower) || lower.startsWith('utm_')) {
        parsed.searchParams.delete(key);
      }
    }

    if (!parsed.searchParams.toString()) {
      parsed.search = '';
    }

    return `${parsed.toString()}${trailing}`;
  } catch {
    return rawUrl;
  }
}

function removeCommonFooterNoise(lines: string[]) {
  const cutoffIndex = lines.findIndex((line) =>
    /^this email was intended for/i.test(line.trim()) ||
    /^you are receiving linkedin invitations emails\./i.test(line.trim()) ||
    /^©\s*\d{4}\s+linkedin/i.test(line.trim()),
  );

  let kept = cutoffIndex >= 0 ? lines.slice(0, cutoffIndex) : lines.slice();

  const promoIndex = kept.findIndex((line) => /^build your network with inmail/i.test(line.trim()));
  if (promoIndex >= 0) {
    const separatorAfterPromo = kept.findIndex(
      (line, idx) => idx > promoIndex && FOOTER_SEPARATOR_REGEX.test(line.trim()),
    );
    const removeUntil = separatorAfterPromo >= 0 ? separatorAfterPromo : Math.min(promoIndex + 4, kept.length - 1);
    kept = [...kept.slice(0, promoIndex), ...kept.slice(removeUntil + 1)];
  }

  return kept.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (FOOTER_SEPARATOR_REGEX.test(trimmed)) return false;
    if (/^unsubscribe:/i.test(trimmed)) return false;
    if (/^help:/i.test(trimmed)) return false;
    if (/^learn why we included this:/i.test(trimmed)) return false;
    return true;
  });
}

export function normalizeMailLikeText(rawBody: string) {
  let normalized = (rawBody || '').replace(/\r\n/g, '\n');
  normalized = decodeQuotedPrintable(normalized);
  normalized = htmlToPlainText(normalized);

  normalized = normalized.replace(/([^:\n]{2,80}):(https?:\/\/)/g, '$1: $2');
  normalized = normalized.replace(URL_REGEX, (url) => sanitizeTrackingUrl(url));

  const cleanedLines = removeCommonFooterNoise(
    normalized
      .split('\n')
      .map((line) => line.replace(/\t/g, ' ').replace(/\s+$/g, '')),
  );

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function buildMailLikeDisplay(rawBody: string): MailLikeDisplay {
  const cleaned = normalizeMailLikeText(rawBody);
  const textLines: string[] = [];
  const actionLinks: MailLikeActionLink[] = [];

  for (const line of cleaned.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      textLines.push('');
      continue;
    }

    const actionMatch = trimmed.match(/^([^:\n]{2,80}):\s*(https?:\/\/\S+)$/i);
    if (actionMatch) {
      actionLinks.push({
        label: actionMatch[1].trim(),
        url: sanitizeTrackingUrl(actionMatch[2].trim()),
      });
      continue;
    }

    textLines.push(trimmed);
  }

  const preview = textLines.join(' ').replace(/\s+/g, ' ').trim();
  return { preview, textLines, actionLinks };
}
