import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, Edit2, ExternalLink, Info } from 'lucide-react';
import { Tooltip } from './ui/Tooltip';
import {
  SourceAnnotation,
  getSourceAnnotationsBatch,
  getSourceAnnotationById,
} from '../api/client';

// ============================================================================
// CONTEXT
// ============================================================================

interface SourceAnnotationContextType {
  annotations: Map<string, SourceAnnotation>;
  loadAnnotations: (items: Array<{ field: string; value: string }>) => Promise<void>;
  getAnnotation: (field: string, value: string) => SourceAnnotation | undefined;
  showDetailCard: (annotation: SourceAnnotation) => void;
  hideDetailCard: () => void;
  isLoading: boolean;
}

const SourceAnnotationContext = createContext<SourceAnnotationContextType | null>(null);

export function useSourceAnnotations() {
  const context = useContext(SourceAnnotationContext);
  if (!context) {
    throw new Error('useSourceAnnotations must be used within a SourceAnnotationProvider');
  }
  return context;
}

// Optional hook that returns null if context is not available
export function useSourceAnnotationsOptional() {
  return useContext(SourceAnnotationContext);
}

interface SourceAnnotationProviderProps {
  children: React.ReactNode;
}

export function SourceAnnotationProvider({ children }: SourceAnnotationProviderProps) {
  const [annotations, setAnnotations] = useState<Map<string, SourceAnnotation>>(new Map());
  const [activeDetailCard, setActiveDetailCard] = useState<SourceAnnotation | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadAnnotations = useCallback(async (items: Array<{ field: string; value: string }>) => {
    if (items.length === 0) return;

    // Filter out items we already have
    const newItems = items.filter(item => !annotations.has(`${item.field}:${item.value}`));
    if (newItems.length === 0) return;

    setIsLoading(true);
    try {
      const result = await getSourceAnnotationsBatch(newItems);
      setAnnotations(prev => {
        const next = new Map(prev);
        Object.entries(result).forEach(([key, annotation]) => {
          next.set(key, annotation);
        });
        return next;
      });
    } catch (error) {
      console.error('Failed to load annotations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [annotations]);

  const getAnnotation = useCallback((field: string, value: string) => {
    return annotations.get(`${field}:${value}`);
  }, [annotations]);

  const showDetailCard = useCallback((annotation: SourceAnnotation) => {
    // Refresh to get latest data including lookupData
    getSourceAnnotationById(annotation.id)
      .then(updated => setActiveDetailCard(updated))
      .catch(() => setActiveDetailCard(annotation));
  }, []);

  const hideDetailCard = useCallback(() => {
    setActiveDetailCard(null);
  }, []);

  return (
    <SourceAnnotationContext.Provider
      value={{
        annotations,
        loadAnnotations,
        getAnnotation,
        showDetailCard,
        hideDetailCard,
        isLoading,
      }}
    >
      {children}
      {activeDetailCard && (
        <AnnotationDetailCard
          annotation={activeDetailCard}
          onClose={hideDetailCard}
        />
      )}
    </SourceAnnotationContext.Provider>
  );
}

// ============================================================================
// ANNOTATION TOOLTIP CONTENT
// ============================================================================

interface AnnotationTooltipContentProps {
  annotation: SourceAnnotation;
  onClick?: () => void;
}

export function AnnotationTooltipContent({ annotation, onClick }: AnnotationTooltipContentProps) {
  return (
    <div className="max-w-xs">
      <div className="flex items-center gap-2 mb-1">
        {annotation.icon && <span className="text-base">{annotation.icon}</span>}
        {annotation.title && (
          <span className="font-semibold text-white">{annotation.title}</span>
        )}
      </div>
      {annotation.description && (
        <p className="text-sm text-gray-300 mb-2">{annotation.description}</p>
      )}
      {annotation.lookupData && Object.keys(annotation.lookupData).length > 0 && (
        <div className="text-xs border-t border-gray-600 pt-2 mt-2">
          {Object.entries(annotation.lookupData).slice(0, 3).map(([key, val]) => (
            <div key={key} className="flex justify-between gap-2">
              <span className="text-gray-400">{key}:</span>
              <span className="text-gray-200 truncate">{String(val)}</span>
            </div>
          ))}
        </div>
      )}
      {annotation.details && onClick && (
        <button
          onClick={onClick}
          className="text-xs text-blue-400 hover:text-blue-300 mt-2 flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          Click for more details
        </button>
      )}
    </div>
  );
}

// ============================================================================
// ANNOTATED VALUE WRAPPER
// ============================================================================

interface AnnotatedValueProps {
  field: string;
  value: string;
  children: React.ReactNode;
}

export function AnnotatedValue({ field, value, children }: AnnotatedValueProps) {
  const context = useSourceAnnotationsOptional();

  if (!context) {
    return <>{children}</>;
  }

  const annotation = context.getAnnotation(field, value);

  if (!annotation) {
    return <>{children}</>;
  }

  const handleClick = () => {
    if (annotation.details) {
      context.showDetailCard(annotation);
    }
  };

  return (
    <Tooltip
      content={
        <AnnotationTooltipContent
          annotation={annotation}
          onClick={annotation.details ? handleClick : undefined}
        />
      }
      placement="top"
      delay={300}
    >
      <span
        className={`
          relative cursor-help
          ${annotation.color ? '' : 'border-b border-dotted border-gray-400 dark:border-gray-500'}
        `}
        style={annotation.color ? { borderBottom: `2px dotted ${annotation.color}` } : undefined}
        onClick={annotation.details ? handleClick : undefined}
      >
        {annotation.icon && (
          <span className="mr-1 text-sm">{annotation.icon}</span>
        )}
        {children}
        <Info className="inline-block w-3 h-3 ml-1 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </span>
    </Tooltip>
  );
}

// ============================================================================
// DETAIL CARD (SLIDE-OUT PANEL)
// ============================================================================

interface AnnotationDetailCardProps {
  annotation: SourceAnnotation;
  onClose: () => void;
  onEdit?: () => void;
}

export function AnnotationDetailCard({ annotation, onClose, onEdit }: AnnotationDetailCardProps) {
  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-nog-800 shadow-2xl z-50 animate-slide-in-right overflow-hidden flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-nog-700">
          <div className="flex items-center gap-3 min-w-0">
            {annotation.icon && (
              <span className="text-2xl flex-shrink-0">{annotation.icon}</span>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {annotation.title || annotation.field_value}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {annotation.field_name}: {annotation.field_value}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-nog-700 rounded-lg transition-colors"
                title="Edit annotation"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-nog-700 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Description */}
          {annotation.description && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Summary
              </h3>
              <p className="text-gray-900 dark:text-white">
                {annotation.description}
              </p>
            </div>
          )}

          {/* Details (Markdown) */}
          {annotation.details && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Details
              </h3>
              <div className="prose prose-sm dark:prose-invert max-w-none bg-gray-50 dark:bg-nog-900 rounded-lg p-3">
                {/* Simple markdown rendering - just paragraphs and line breaks */}
                {annotation.details.split('\n\n').map((paragraph, i) => (
                  <p key={i} className="mb-2 last:mb-0 text-gray-700 dark:text-gray-300">
                    {paragraph.split('\n').map((line, j) => (
                      <React.Fragment key={j}>
                        {line}
                        {j < paragraph.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Lookup Data */}
          {annotation.lookupData && Object.keys(annotation.lookupData).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Linked Data
              </h3>
              <div className="bg-gray-50 dark:bg-nog-900 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(annotation.lookupData).map(([key, val]) => (
                      <tr key={key} className="border-b border-gray-200 dark:border-nog-700 last:border-0">
                        <td className="px-3 py-2 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {key}
                        </td>
                        <td className="px-3 py-2 text-gray-900 dark:text-white">
                          {String(val)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tags */}
          {annotation.tags && annotation.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {annotation.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-4 border-t border-gray-200 dark:border-nog-700 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex justify-between">
            <span>Created: {new Date(annotation.created_at).toLocaleDateString()}</span>
            <span>Updated: {new Date(annotation.updated_at).toLocaleDateString()}</span>
          </div>
        </footer>
      </div>
    </>
  );
}

// Add animation styles if not already present
const styles = `
@keyframes slide-in-right {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.animate-slide-in-right {
  animation: slide-in-right 0.2s ease-out;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  if (!document.head.querySelector('[data-source-annotations-styles]')) {
    styleSheet.setAttribute('data-source-annotations-styles', '');
    document.head.appendChild(styleSheet);
  }
}
