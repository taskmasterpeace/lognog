import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, X, History, ArrowRight } from 'lucide-react';

interface NaturalLanguageInputProps {
  onQueryGenerated: (query: string) => void;
  placeholder?: string;
}

const EXAMPLE_QUERIES = [
  { text: 'Show me errors from the last hour', query: 'search severity>=error | table timestamp hostname message' },
  { text: 'Top 10 hosts by log count', query: 'search * | stats count by hostname | sort desc count | limit 10' },
  { text: 'Failed logins grouped by user', query: 'search message~"failed" message~"login" | stats count by user | sort desc count' },
  { text: 'Errors over time by severity', query: 'search severity>=warning | timechart count by severity' },
];

export function NaturalLanguageInput({
  onQueryGenerated,
  placeholder = 'Describe what you want to find...',
}: NaturalLanguageInputProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedQuery, setGeneratedQuery] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    setError(null);
    setGeneratedQuery(null);

    try {
      const response = await fetch('/api/ai/generate-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input }),
      });

      if (response.status === 503) {
        // Ollama not available, use fallback
        const fallbackQuery = generateFallbackQuery(input);
        setGeneratedQuery(fallbackQuery);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to generate query');
      }

      const data = await response.json();
      setGeneratedQuery(data.query);
    } catch (err) {
      // Use intelligent fallback
      const fallbackQuery = generateFallbackQuery(input);
      setGeneratedQuery(fallbackQuery);
    } finally {
      setLoading(false);
    }
  };

  const handleUseQuery = () => {
    if (generatedQuery) {
      onQueryGenerated(generatedQuery);
      setGeneratedQuery(null);
      setInput('');
    }
  };

  const handleExample = (example: typeof EXAMPLE_QUERIES[0]) => {
    setGeneratedQuery(example.query);
    setInput(example.text);
    setShowExamples(false);
  };

  return (
    <div className="relative">
      {/* Main Input */}
      <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-amber-50 to-amber-50 dark:from-amber-900/20 dark:to-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
        />
        <button
          onClick={() => setShowExamples(!showExamples)}
          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded"
          title="Show examples"
        >
          <History className="w-4 h-4" />
        </button>
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || loading}
          className="p-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded transition-colors"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Examples Dropdown */}
      {showExamples && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowExamples(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white dark:bg-nog-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Example queries
              </span>
            </div>
            {EXAMPLE_QUERIES.map((example, i) => (
              <button
                key={i}
                onClick={() => handleExample(example)}
                className="w-full px-3 py-2 text-left hover:bg-nog-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <p className="text-sm text-slate-900 dark:text-slate-100">{example.text}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">
                  {example.query}
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Generated Query */}
      {generatedQuery && (
        <div className="mt-2 p-3 bg-white dark:bg-nog-800 border border-slate-200 dark:border-slate-600 rounded-lg">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Generated Query:
              </p>
              <code className="block p-2 bg-nog-50 dark:bg-nog-900 rounded text-sm font-mono text-slate-800 dark:text-slate-200 overflow-x-auto">
                {generatedQuery}
              </code>
            </div>
            <button
              onClick={() => setGeneratedQuery(null)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setInput('');
                setGeneratedQuery(null);
              }}
              className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-nog-100 dark:hover:bg-slate-700 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleUseQuery}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors"
            >
              Use Query
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

function generateFallbackQuery(input: string): string {
  const lower = input.toLowerCase();

  // Error-related queries
  if (lower.includes('error') || lower.includes('fail') || lower.includes('exception')) {
    if (lower.includes('by host') || lower.includes('per host') || lower.includes('group')) {
      return 'search severity>=error | stats count by hostname | sort desc count';
    }
    if (lower.includes('over time') || lower.includes('timeline') || lower.includes('chart')) {
      return 'search severity>=error | timechart count';
    }
    return 'search severity>=error | table timestamp hostname app_name message | limit 100';
  }

  // Login-related queries
  if (lower.includes('login') || lower.includes('auth') || lower.includes('signin')) {
    if (lower.includes('fail')) {
      return 'search message~"failed" message~"login" | stats count by user hostname | sort desc count';
    }
    return 'search message~"login" | stats count by user | sort desc count | limit 20';
  }

  // Top/count queries
  if (lower.includes('top') || lower.includes('most')) {
    if (lower.includes('host')) {
      return 'search * | stats count by hostname | sort desc count | limit 10';
    }
    if (lower.includes('app') || lower.includes('application')) {
      return 'search * | stats count by app_name | sort desc count | limit 10';
    }
    if (lower.includes('ip')) {
      return 'search * | stats count by source_ip | sort desc count | limit 10';
    }
    return 'search * | stats count by hostname | sort desc count | limit 10';
  }

  // Time-based queries
  if (lower.includes('over time') || lower.includes('timeline') || lower.includes('trend')) {
    return 'search * | timechart count';
  }

  // Last N queries
  if (lower.includes('last') || lower.includes('recent')) {
    const countMatch = lower.match(/last\s+(\d+)/);
    const count = countMatch ? countMatch[1] : '100';
    return `search * | table timestamp hostname app_name severity message | limit ${count}`;
  }

  // Default: search for keywords
  const keywords = input.split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'for', 'from', 'with', 'show', 'find', 'get', 'all'].includes(w.toLowerCase()));
  if (keywords.length > 0) {
    const searchTerms = keywords.map(k => `message~"${k}"`).join(' ');
    return `search ${searchTerms} | table timestamp hostname message | limit 100`;
  }

  return 'search * | table timestamp hostname app_name severity message | limit 100';
}

export default NaturalLanguageInput;
