import { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Loader2,
  User,
  Shield,
  Server,
  ClipboardCheck,
  MessageSquare,
  Wrench,
  ChevronDown,
  CheckCircle,
  XCircle,
  Trash2,
  Plus,
} from 'lucide-react';

interface AgentPersona {
  id: string;
  name: string;
  description: string;
  icon: string;
  tools: string[];
  examples: string[];
}

interface ToolCall {
  tool: string;
  parameters: Record<string, unknown>;
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  created_at: string;
}

interface Conversation {
  id: string;
  persona_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: Message[];
}

const PERSONA_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield,
  Server,
  ClipboardCheck,
  Bot,
};

export function AgentPage() {
  const [personas, setPersonas] = useState<AgentPersona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<AgentPersona | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load personas and check AI status on mount
  useEffect(() => {
    loadPersonas();
    checkAiStatus();
    loadConversations();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const checkAiStatus = async () => {
    try {
      const response = await fetch('/api/ai/status');
      const data = await response.json();
      setAiAvailable(data.aiAvailable);
    } catch {
      setAiAvailable(false);
    }
  };

  const loadPersonas = async () => {
    try {
      const response = await fetch('/api/ai/agents/personas');
      const data = await response.json();
      setPersonas(data.personas);
      if (data.personas.length > 0 && !selectedPersona) {
        setSelectedPersona(data.personas.find((p: AgentPersona) => p.id === 'general') || data.personas[0]);
      }
    } catch (error) {
      console.error('Failed to load personas:', error);
    }
  };

  const loadConversations = async () => {
    try {
      const response = await fetch('/api/ai/agents/conversations?limit=20');
      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadConversation = async (id: string) => {
    try {
      const response = await fetch(`/api/ai/agents/conversations/${id}`);
      const data = await response.json();
      setCurrentConversation(data);
      setMessages(data.messages || []);
      // Set persona based on conversation
      const persona = personas.find((p) => p.id === data.persona_id);
      if (persona) {
        setSelectedPersona(persona);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const startNewConversation = () => {
    setCurrentConversation(null);
    setMessages([]);
  };

  const deleteConversation = async (id: string) => {
    try {
      await fetch(`/api/ai/agents/conversations/${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversation?.id === id) {
        startNewConversation();
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleSubmit = async () => {
    if (!input.trim() || loading || !selectedPersona) return;

    const userMessage = input.trim();
    setInput('');

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setLoading(true);

    try {
      const response = await fetch('/api/ai/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversation_id: currentConversation?.id,
          persona_id: selectedPersona.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      // Update conversation ID if this is a new conversation
      if (!currentConversation) {
        setCurrentConversation({
          id: data.conversationId,
          persona_id: selectedPersona.id,
          title: userMessage.slice(0, 50),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        loadConversations(); // Refresh list
      }

      // Add assistant message
      const assistantMsg: Message = {
        id: data.messageId,
        role: 'assistant',
        content: data.message,
        toolCalls: data.toolCalls,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Agent chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const PersonaIcon = selectedPersona ? PERSONA_ICONS[selectedPersona.icon] || Bot : Bot;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar - Conversations */}
      <div className="w-64 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={startNewConversation}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
              No conversations yet
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  currentConversation?.id === conv.id
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
                onClick={() => loadConversation(conv.id)}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-sm truncate">{conv.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
                >
                  <Trash2 className="w-3 h-3 text-red-500" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header with Persona Selector */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="relative">
            <button
              onClick={() => setShowPersonaDropdown(!showPersonaDropdown)}
              className="flex items-center gap-3 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
            >
              <div className="p-1.5 bg-gradient-to-r from-amber-500 to-amber-500 rounded-lg">
                <PersonaIcon className="w-4 h-4 text-white" />
              </div>
              <div className="text-left">
                <p className="font-medium text-sm text-slate-900 dark:text-slate-100">
                  {selectedPersona?.name || 'Select Persona'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedPersona?.tools.length || 0} tools available
                </p>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {showPersonaDropdown && (
              <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50">
                {personas.map((persona) => {
                  const Icon = PERSONA_ICONS[persona.icon] || Bot;
                  return (
                    <button
                      key={persona.id}
                      onClick={() => {
                        setSelectedPersona(persona);
                        setShowPersonaDropdown(false);
                      }}
                      className={`w-full flex items-start gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 first:rounded-t-xl last:rounded-b-xl transition-colors ${
                        selectedPersona?.id === persona.id ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                      }`}
                    >
                      <div className="p-2 bg-gradient-to-r from-amber-500 to-amber-500 rounded-lg flex-shrink-0">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{persona.name}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                          {persona.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                aiAvailable
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${aiAvailable ? 'bg-green-500' : 'bg-red-500'}`} />
              {aiAvailable ? 'AI Online' : 'AI Offline'}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && selectedPersona ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="p-4 bg-gradient-to-r from-amber-500 to-amber-500 rounded-2xl mb-4">
                <PersonaIcon className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
                {selectedPersona.name}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md mb-6">{selectedPersona.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
                {selectedPersona.examples.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(example)}
                    className="text-left px-4 py-3 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    msg.role === 'user' ? 'bg-amber-500' : 'bg-gradient-to-r from-amber-500 to-amber-500'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User className="w-5 h-5 text-white" />
                  ) : (
                    <Bot className="w-5 h-5 text-white" />
                  )}
                </div>

                <div className={`flex-1 max-w-3xl ${msg.role === 'user' ? 'text-right' : ''}`}>
                  <div
                    className={`inline-block p-4 rounded-2xl ${
                      msg.role === 'user'
                        ? 'bg-amber-500 text-white rounded-tr-sm'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-tl-sm'
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                  </div>

                  {/* Tool Calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.toolCalls.map((tc, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          <Wrench className="w-4 h-4 text-slate-400 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                                {tc.tool}
                              </span>
                              {tc.result.success ? (
                                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-red-500" />
                              )}
                            </div>
                            <pre className="text-xs text-slate-500 dark:text-slate-400 overflow-x-auto">
                              {JSON.stringify(tc.parameters, null, 2)}
                            </pre>
                            {tc.result.error && (
                              <p className="text-xs text-red-500 mt-1">{tc.result.error}</p>
                            )}
                            {tc.result.data !== undefined && (
                              <details className="mt-2">
                                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
                                  View result
                                </summary>
                                <pre className="mt-1 text-xs text-slate-500 dark:text-slate-400 overflow-x-auto max-h-40 overflow-y-auto bg-slate-100 dark:bg-slate-900 p-2 rounded">
                                  {JSON.stringify(tc.result.data as Record<string, unknown>, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-amber-500 to-amber-500 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-tl-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  <span className="text-sm text-slate-600 dark:text-slate-300">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={`Ask ${selectedPersona?.name || 'the agent'}...`}
              className="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-700 border-none rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none min-h-[44px] max-h-[200px]"
              disabled={loading || !aiAvailable}
              rows={1}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || loading || !aiAvailable}
              className="p-3 bg-gradient-to-r from-amber-500 to-amber-500 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}

export default AgentPage;
