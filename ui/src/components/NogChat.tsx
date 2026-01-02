import { useState, useRef, useEffect } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  AlertCircle,
  Search,
  BarChart3,
  Shield,
  Zap,
  BookOpen,
  TrendingUp,
  ChevronRight,
  Copy,
  Check,
  Database,
} from 'lucide-react';
import { CitationsPanel, CitedSource, SearchStats } from './NogChat/CitationsPanel';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'query' | 'insight';
  query?: string;
  citations?: CitedSource[];
  searchStats?: SearchStats;
}

interface QuickAction {
  icon: React.ElementType;
  label: string;
  prompt: string;
  category: 'learn' | 'query' | 'insight' | 'splunk';
}

const QUICK_ACTIONS: QuickAction[] = [
  // Learning & Onboarding
  {
    icon: BookOpen,
    label: 'Getting Started',
    prompt: 'Walk me through setting up LogNog step by step. I\'m new here.',
    category: 'learn',
  },
  {
    icon: Zap,
    label: 'Splunk → LogNog',
    prompt: 'I\'m a Splunk expert. Show me how LogNog compares and give me a quick translation guide.',
    category: 'splunk',
  },
  // Query Building
  {
    icon: Search,
    label: 'Build a Query',
    prompt: 'Help me build a query. I want to find error logs from the last hour grouped by hostname.',
    category: 'query',
  },
  {
    icon: Shield,
    label: 'Security Query',
    prompt: 'Give me useful security queries - failed logins, auth errors, suspicious activity.',
    category: 'query',
  },
  // Data Insights
  {
    icon: TrendingUp,
    label: 'Analyze My Data',
    prompt: 'Analyze my log data. What are the top sources of errors? Any patterns I should know about?',
    category: 'insight',
  },
  {
    icon: BarChart3,
    label: 'Dashboard Ideas',
    prompt: 'Suggest dashboard panels based on common monitoring needs. Give me the queries.',
    category: 'insight',
  },
];

const STARTER_PROMPTS = [
  'What\'s the LogNog equivalent of Splunk\'s "index=main | stats count by host"?',
  'Show me how to create an alert for high error rates',
  'What log sources can I connect to LogNog?',
  'Help me write a timechart query',
];

export function NogChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkAiStatus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const checkAiStatus = async () => {
    try {
      const response = await fetch('/api/ai/status');
      const data = await response.json();
      setAiAvailable(data.aiAvailable);
    } catch {
      setAiAvailable(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const extractCodeBlocks = (content: string): string[] => {
    const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)```/g;
    const matches: string[] = [];
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      matches.push(match[1].trim());
    }
    return matches;
  };

  const handleSubmit = async (customPrompt?: string) => {
    const messageText = customPrompt || input.trim();
    if (!messageText || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: messageText }]);
    setLoading(true);

    try {
      // Check if this is a data insight request
      const isInsightRequest = messageText.toLowerCase().includes('analyze') ||
        messageText.toLowerCase().includes('my data') ||
        messageText.toLowerCase().includes('my logs') ||
        messageText.toLowerCase().includes('what errors') ||
        messageText.toLowerCase().includes('top sources') ||
        messageText.toLowerCase().includes('patterns');

      const response = await fetch('/api/ai/nogchat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          requestInsights: isInsightRequest,
          history: messages.slice(-6), // Last 6 messages for context
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          type: data.type || 'text',
          query: data.executedQuery,
          citations: data.citations,
          searchStats: data.searchStats,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please check that Ollama is running or try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (msg: Message, index: number) => {
    const codeBlocks = msg.role === 'assistant' ? extractCodeBlocks(msg.content) : [];

    // Format content - convert markdown-style formatting
    const formatContent = (content: string) => {
      // Remove code blocks for separate rendering
      let formatted = content.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, '%%%CODE_BLOCK%%%');
      // Bold
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Inline code
      formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-slate-200 dark:bg-slate-600 px-1 rounded text-sm">$1</code>');
      return formatted;
    };

    return (
      <div
        key={index}
        className={`flex gap-3 animate-fade-in ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
      >
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            msg.role === 'user'
              ? 'bg-sky-500'
              : 'bg-gradient-to-br from-emerald-500 to-teal-600'
          }`}
        >
          {msg.role === 'user' ? (
            <User className="w-4 h-4 text-white" />
          ) : (
            <Bot className="w-4 h-4 text-white" />
          )}
        </div>
        <div
          className={`flex-1 max-w-[85%] ${
            msg.role === 'user'
              ? 'bg-sky-500 text-white rounded-2xl rounded-tr-sm p-3'
              : 'space-y-2'
          }`}
        >
          {msg.role === 'user' ? (
            <div className="text-sm">{msg.content}</div>
          ) : (
            <>
              <div
                className="bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-2xl rounded-tl-sm p-3"
              >
                <div
                  className="text-sm whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: formatContent(msg.content).split('%%%CODE_BLOCK%%%').map((part, i) => {
                      if (i < codeBlocks.length) {
                        return part + `<div class="code-placeholder" data-index="${i}"></div>`;
                      }
                      return part;
                    }).join(''),
                  }}
                />
              </div>
              {/* Render code blocks with copy buttons */}
              {codeBlocks.map((code, codeIndex) => (
                <div
                  key={codeIndex}
                  className="relative bg-slate-800 dark:bg-slate-900 rounded-lg overflow-hidden"
                >
                  <div className="flex items-center justify-between px-3 py-1.5 bg-slate-700 dark:bg-slate-800 border-b border-slate-600">
                    <span className="text-xs text-slate-400 font-mono">DSL Query</span>
                    <button
                      onClick={() => copyToClipboard(code, index * 100 + codeIndex)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      {copiedIndex === index * 100 + codeIndex ? (
                        <>
                          <Check className="w-3 h-3" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3 text-sm text-emerald-400 font-mono overflow-x-auto">
                    {code}
                  </pre>
                </div>
              ))}
              {/* Show executed query badge for insights */}
              {msg.query && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Database className="w-3 h-3" />
                  <span>Analyzed your data with: <code className="text-emerald-600 dark:text-emerald-400">{msg.query}</code></span>
                </div>
              )}
              {/* Show citations panel for RAG-enhanced responses */}
              {msg.citations && msg.citations.length > 0 && (
                <CitationsPanel
                  citations={msg.citations}
                  searchStats={msg.searchStats}
                />
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 group animate-scale-in"
        title="NogChat - Your LogNog Assistant"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full blur-lg opacity-50 group-hover:opacity-75 transition-all duration-300" />
          <div className="relative p-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 active:scale-95">
            <MessageCircle className="w-6 h-6" />
          </div>
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
        </div>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-3rem)] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[650px] animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100">NogChat</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              {aiAvailable === null ? (
                'Connecting...'
              ) : aiAvailable ? (
                <>
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  Ready to help
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                  AI Unavailable
                </>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[250px]">
        {messages.length === 0 ? (
          <div className="space-y-4">
            {/* Welcome */}
            <div className="text-center py-2">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-2xl mb-3">
                <Sparkles className="w-8 h-8 text-emerald-500" />
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                Welcome to NogChat
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your intelligent LogNog assistant. Ask anything about queries, alerts, or analyze your data.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">
                Quick Actions
              </p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((action, i) => {
                  const Icon = action.icon;
                  const categoryColors = {
                    learn: 'from-blue-500/10 to-indigo-500/10 hover:from-blue-500/20 hover:to-indigo-500/20 text-blue-600 dark:text-blue-400',
                    query: 'from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20 text-emerald-600 dark:text-emerald-400',
                    insight: 'from-purple-500/10 to-pink-500/10 hover:from-purple-500/20 hover:to-pink-500/20 text-purple-600 dark:text-purple-400',
                    splunk: 'from-orange-500/10 to-amber-500/10 hover:from-orange-500/20 hover:to-amber-500/20 text-orange-600 dark:text-orange-400',
                  };
                  const staggerClass = `animate-stagger-${Math.min(i + 1, 8)}`;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSubmit(action.prompt)}
                      className={`flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r ${categoryColors[action.category]} transition-all duration-200 text-left group hover:scale-[1.02] active:scale-[0.98] animate-fade-in ${staggerClass}`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                        {action.label}
                      </span>
                      <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-all duration-200" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Starter Prompts */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">
                Try asking
              </p>
              <div className="space-y-1.5">
                {STARTER_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(prompt);
                      inputRef.current?.focus();
                    }}
                    className="w-full text-left px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-600 dark:text-slate-300 truncate"
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => renderMessage(msg, i))
        )}
        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-tl-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                <span className="text-sm text-slate-500">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* AI Unavailable Warning */}
      {aiAvailable === false && (
        <div className="mx-4 mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Start Ollama or configure OpenRouter for AI features.</span>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
            placeholder="Ask about queries, alerts, your data..."
            className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 border-none rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            disabled={loading}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || loading}
            className="p-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-400">
          <span className="font-medium text-emerald-500">NogChat</span>
          <span>•</span>
          <span>Powered by Local AI</span>
        </div>
      </div>
    </div>
  );
}

export default NogChat;
