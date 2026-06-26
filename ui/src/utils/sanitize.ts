import DOMPurify, { type Config } from 'dompurify';

/**
 * Allowed tags/attributes for the limited set of formatting our chat + citation
 * renderers emit. Anything else (script, iframe, event handlers, etc.) is stripped.
 *
 * Tags emitted by the codebase:
 *  - <strong>/<em> from markdown bold/italic
 *  - <code>/<pre> for inline + block code
 *  - <br> for line breaks
 *  - <mark> for citation highlights
 *  - <span> with a className for styled inline code/highlights
 *  - <a href> for any links the model may produce (safe schemes only)
 */
const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: ['strong', 'em', 'b', 'i', 'code', 'pre', 'br', 'span', 'mark', 'a', 'p', 'ul', 'ol', 'li'],
  ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
  // Only allow safe URL schemes; blocks javascript:, data:, etc.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  // Strip any attribute that isn't explicitly allowed (drops on* handlers, style, etc.)
  ALLOW_DATA_ATTR: false,
};

/**
 * Sanitize an HTML string before injecting it via dangerouslySetInnerHTML.
 * Strips scripts, event handlers and unsafe URLs while keeping the small set
 * of formatting tags the UI relies on.
 */
export function sanitize(dirty: string): string {
  return DOMPurify.sanitize(dirty, SANITIZE_CONFIG) as string;
}
