import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircleQuestion, X, Send, Loader2, ExternalLink, BarChart3, BookOpen } from 'lucide-react';
import { askHelpbot, type HelpbotAnswer } from '../api/client';

interface Turn {
  role: 'user' | 'bot';
  text: string;
  answer?: HelpbotAnswer;
}

const SUGGESTIONS = [
  'How do I connect a new app?',
  'How many errors in the last 24h?',
  'How do I build a dashboard?',
  'What are the top hosts by volume?',
];

/**
 * In-app help bot. Answers "how do I…" questions from the user guide (with
 * citations that deep-link into the guide) and "how many…/show me…" questions
 * about the user's actual logs (via NL→DSL, with a link to open the results in
 * Search). Always provides links. On-brand; no purple.
 */
export default function HelpBot() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, loading]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || loading) return;
    setInput('');
    setTurns((t) => [...t, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const answer = await askHelpbot(question);
      setTurns((t) => [...t, { role: 'bot', text: answer.answer, answer }]);
    } catch {
      setTurns((t) => [
        ...t,
        { role: 'bot', text: "Sorry, I couldn't answer that right now. Try the User Guide from the sidebar." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-honey-500 hover:bg-honey-600 text-white shadow-lg flex items-center justify-center transition-colors"
          title="Ask the help bot"
          aria-label="Ask the help bot"
        >
          <MessageCircleQuestion className="w-6 h-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-40 w-[min(24rem,calc(100vw-2.5rem))] h-[min(34rem,calc(100vh-6rem))] rounded-nog shadow-2xl border border-nog-200 dark:border-nog-700 bg-white dark:bg-nog-800 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-nog-800 dark:bg-nog-900 text-white">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="w-5 h-5 text-honey-400" />
              <div>
                <p className="text-sm font-semibold leading-none">Ask LogNog</p>
                <p className="text-[11px] text-nog-300 mt-0.5">Guide answers + your live data</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-nog-300 hover:text-white" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Conversation */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {turns.length === 0 && (
              <div className="text-sm text-nog-500 dark:text-nog-400">
                <p className="mb-2">Ask how something works, or ask about your logs:</p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="text-left text-xs px-2.5 py-1.5 rounded-lg border border-nog-200 dark:border-nog-700 hover:border-honey-400 hover:text-honey-600 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[85%] rounded-nog px-3 py-2 text-sm ${
                    t.role === 'user'
                      ? 'bg-honey-500 text-white'
                      : 'bg-nog-100 dark:bg-nog-900 text-nog-800 dark:text-nog-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{t.text}</p>

                  {/* Data results link */}
                  {t.answer?.mode === 'data' && t.answer.data && (
                    <button
                      onClick={() => navigate(t.answer!.data!.link)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-honey-700 dark:text-honey-400 hover:underline"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      View {t.answer.data.rowCount} result{t.answer.data.rowCount === 1 ? '' : 's'} in Search
                    </button>
                  )}

                  {/* Guide citations */}
                  {t.answer?.citations && t.answer.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.answer.citations.slice(0, 3).map((c) => (
                        <a
                          key={c.anchor}
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-white dark:bg-nog-800 border border-nog-200 dark:border-nog-700 text-nog-600 dark:text-nog-300 hover:border-honey-400"
                          title={c.title}
                        >
                          <BookOpen className="w-3 h-3" />
                          {c.title.length > 24 ? c.title.slice(0, 24) + '…' : c.title}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-nog px-3 py-2 bg-nog-100 dark:bg-nog-900 text-nog-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-2 border-t border-nog-200 dark:border-nog-700">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') ask(input); }}
                placeholder="Ask a question…"
                className="flex-1 px-3 py-2 rounded-nog border border-nog-200 dark:border-nog-600 bg-white dark:bg-nog-900 text-sm text-nog-900 dark:text-nog-100 focus:outline-none focus:ring-2 focus:ring-honey-400"
              />
              <button
                onClick={() => ask(input)}
                disabled={loading || !input.trim()}
                className="p-2 rounded-nog bg-honey-500 hover:bg-honey-600 disabled:opacity-40 text-white"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-nog-400 mt-1 px-1">
              Answers come from the LogNog guide and your last 24h of logs.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
