import { useState } from 'react';
import { BookOpen, ExternalLink, Loader2 } from 'lucide-react';

/**
 * In-app User & Admin Guide. Embeds the self-contained, searchable guide that
 * the docs pipeline renders to /user-guide.html (sticky sidebar TOC, scroll-spy,
 * and a live section filter). Kept as an iframe so the guide stays a single
 * source of truth that re-renders from docs/ on each release.
 */
export default function GuidePage() {
  const [loaded, setLoaded] = useState(false);
  const src = '/user-guide.html';

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-nog-200 dark:border-nog-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-nog bg-honey-100 dark:bg-honey-900/30 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-honey-600 dark:text-honey-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-nog-900 dark:text-nog-100 tracking-tight">User Guide</h1>
            <p className="text-xs text-nog-500">Everything you can do in LogNog — search the guide, or ask the help bot.</p>
          </div>
        </div>
        <a href={src} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-2 text-sm">
          <ExternalLink className="w-4 h-4" /> Open in new tab
        </a>
      </div>
      <div className="flex-1 min-h-0 relative">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-nog-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
        <iframe
          title="LogNog User Guide"
          src={src}
          onLoad={() => setLoaded(true)}
          className="w-full h-full border-0 bg-white dark:bg-nog-900"
        />
      </div>
    </div>
  );
}
