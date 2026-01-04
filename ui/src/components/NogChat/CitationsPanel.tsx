import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Zap,
  Search,
  Sparkles,
  Info,
} from 'lucide-react';

// Types matching the API response
export interface CitedSource {
  id: string;
  title: string;
  relevanceScore: number;
  relevanceCategory: 'high' | 'medium' | 'low';
  matchType: 'vector' | 'text' | 'hybrid';
  excerpt: string;
  highlightedText: string;
  metadata: {
    sourceType: string;
    indexedAt?: string;
    chunkIndex?: number;
    totalChunks?: number;
  };
}

export interface SearchStats {
  vectorMatches: number;
  textMatches: number;
  hybridMatches: number;
  reranked: boolean;
  totalTimeMs: number;
}

interface CitationsPanelProps {
  citations: CitedSource[];
  searchStats?: SearchStats;
  onSourceClick?: (source: CitedSource) => void;
}

function RelevanceBadge({ category }: { category: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    low: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[category]}`}>
      {category}
    </span>
  );
}

function MatchTypeBadge({ type }: { type: 'vector' | 'text' | 'hybrid' }) {
  const configs = {
    vector: {
      icon: Sparkles,
      label: 'Semantic',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    },
    text: {
      icon: Search,
      label: 'Keyword',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    },
    hybrid: {
      icon: Zap,
      label: 'Hybrid',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    },
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function SourceCard({
  source,
  isExpanded,
  onToggle,
  onClick,
}: {
  source: CitedSource;
  isExpanded: boolean;
  onToggle: () => void;
  onClick?: () => void;
}) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
        <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
        <span className="flex-1 text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
          {source.title}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <RelevanceBadge category={source.relevanceCategory} />
          <MatchTypeBadge type={source.matchType} />
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-slate-700 p-3 space-y-3">
          {/* Highlighted excerpt */}
          <div
            className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: source.highlightedText.replace(
                /<mark>/g,
                '<mark class="bg-amber-200 dark:bg-amber-900/50 px-0.5 rounded">'
              ),
            }}
          />

          {/* Metadata */}
          <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
            {source.metadata.sourceType && (
              <span className="inline-flex items-center gap-1">
                <span className="font-medium">Source:</span> {source.metadata.sourceType}
              </span>
            )}
            {source.metadata.chunkIndex !== undefined && source.metadata.totalChunks && (
              <span className="inline-flex items-center gap-1">
                <span className="font-medium">Part:</span>{' '}
                {source.metadata.chunkIndex + 1}/{source.metadata.totalChunks}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <span className="font-medium">Score:</span>{' '}
              {(source.relevanceScore * 100).toFixed(0)}%
            </span>
          </div>

          {/* Actions */}
          {onClick && (
            <button
              onClick={onClick}
              className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline"
            >
              View full document
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatsBar({ stats }: { stats: SearchStats }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 px-1">
      <span>
        <Sparkles className="w-3 h-3 inline mr-1" />
        {stats.vectorMatches} semantic
      </span>
      <span>
        <Search className="w-3 h-3 inline mr-1" />
        {stats.textMatches} keyword
      </span>
      {stats.hybridMatches > 0 && (
        <span>
          <Zap className="w-3 h-3 inline mr-1" />
          {stats.hybridMatches} both
        </span>
      )}
      {stats.reranked && (
        <span className="text-amber-600 dark:text-amber-400">
          Re-ranked
        </span>
      )}
      <span className="ml-auto">
        {stats.totalTimeMs}ms
      </span>
    </div>
  );
}

export function CitationsPanel({
  citations,
  searchStats,
  onSourceClick,
}: CitationsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  if (citations.length === 0) {
    return null;
  }

  const toggleSource = (id: string) => {
    const newExpanded = new Set(expandedSources);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSources(newExpanded);
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 overflow-hidden">
      {/* Panel Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
        <Info className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Sources ({citations.length})
        </span>
        {!isExpanded && (
          <span className="text-xs text-slate-500 ml-auto">
            Click to expand
          </span>
        )}
      </button>

      {/* Panel Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Stats */}
          {searchStats && <StatsBar stats={searchStats} />}

          {/* Source Cards */}
          <div className="space-y-2">
            {citations.slice(0, 5).map((citation) => (
              <SourceCard
                key={citation.id}
                source={citation}
                isExpanded={expandedSources.has(citation.id)}
                onToggle={() => toggleSource(citation.id)}
                onClick={onSourceClick ? () => onSourceClick(citation) : undefined}
              />
            ))}
          </div>

          {/* Show more indicator */}
          {citations.length > 5 && (
            <div className="text-center text-xs text-slate-500 dark:text-slate-400">
              +{citations.length - 5} more sources
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CitationsPanel;
