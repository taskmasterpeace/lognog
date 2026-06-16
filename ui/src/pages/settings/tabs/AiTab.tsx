import { useState, useEffect } from 'react';
import { authFetch } from '../../../contexts/AuthContext';
import {
  Bot,
  Zap,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export default function AiTab() {
  const [aiConfig, setAiConfig] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaveSuccess, setAiSaveSuccess] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTestResult, setAiTestResult] = useState<any>(null);
  const [aiTesting, setAiTesting] = useState(false);

  const [localOllamaUrl, setLocalOllamaUrl] = useState('');
  const [localOllamaModel, setLocalOllamaModel] = useState('');
  const [localReasoningModel, setLocalReasoningModel] = useState('');
  const [localEmbedModel, setLocalEmbedModel] = useState('');
  const [localOpenrouterKey, setLocalOpenrouterKey] = useState('');
  const [localOpenrouterModel, setLocalOpenrouterModel] = useState('');

  useEffect(() => {
    loadAiConfig();
  }, []);

  useEffect(() => {
    if (aiConfig) {
      setLocalOllamaUrl(aiConfig.ollama?.url || '');
      setLocalOllamaModel(aiConfig.ollama?.model || '');
      setLocalReasoningModel(aiConfig.ollama?.reasoning_model || '');
      setLocalEmbedModel(aiConfig.ollama?.embed_model || '');
      setLocalOpenrouterModel(aiConfig.openrouter?.model || '');
    }
  }, [aiConfig]);

  const loadAiConfig = async () => {
    setAiLoading(true);
    try {
      const response = await authFetch('/settings/ai');
      if (response.ok) {
        setAiConfig(await response.json());
      }
    } catch (err) {
      console.error('Failed to load AI config:', err);
      setAiError('Failed to load AI configuration.');
    } finally {
      setAiLoading(false);
    }
  };

  const saveAiConfig = async (updates: any) => {
    setAiSaving(true);
    setAiSaveSuccess(false);
    setAiError(null);
    try {
      const response = await authFetch('/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (response.ok) {
        await loadAiConfig();
        setAiSaveSuccess(true);
        setTimeout(() => setAiSaveSuccess(false), 2000);
      } else {
        const data = await response.json().catch(() => ({}));
        setAiError(data.error || 'Failed to save AI configuration.');
      }
    } catch (err) {
      console.error('Failed to save AI config:', err);
      setAiError('Failed to connect to server.');
    } finally {
      setAiSaving(false);
    }
  };

  const testAiConnection = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const response = await authFetch('/settings/ai/test', {
        method: 'POST',
      });
      setAiTestResult(await response.json());
    } catch (err) {
      setAiTestResult({ success: false, error: 'Failed to connect' });
    } finally {
      setAiTesting(false);
    }
  };

  const handleSaveOllama = () => {
    saveAiConfig({
      ollama: {
        url: localOllamaUrl,
        model: localOllamaModel,
        reasoning_model: localReasoningModel,
        embed_model: localEmbedModel,
      },
    });
  };

  const handleSaveOpenrouter = () => {
    saveAiConfig({
      openrouter: {
        api_key: localOpenrouterKey || undefined,
        model: localOpenrouterModel,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Save error banner (applies to both sections) */}
      {aiError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-4 h-4" />
          {aiError}
        </div>
      )}

      {/* Ollama Configuration */}
      <section className="bg-white dark:bg-nog-800 rounded-xl shadow-sm border border-nog-200 dark:border-nog-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-nog-900 dark:text-nog-100 flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Ollama Configuration
          </h2>
          {aiSaveSuccess && (
            <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <Check className="w-4 h-4" />
              Saved
            </span>
          )}
        </div>

        <p className="text-sm text-nog-500 dark:text-nog-400 mb-6">
          Configure local Ollama instance for AI-powered features like natural language queries and dashboard insights.
        </p>

        {aiLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-nog-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1">
                Ollama URL
              </label>
              <input
                type="text"
                value={localOllamaUrl}
                onChange={(e) => setLocalOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="input font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1">
                  Chat Model
                </label>
                <input
                  type="text"
                  value={localOllamaModel}
                  onChange={(e) => setLocalOllamaModel(e.target.value)}
                  placeholder="llama3.2"
                  className="input font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1">
                  Reasoning Model (optional)
                </label>
                <input
                  type="text"
                  value={localReasoningModel}
                  onChange={(e) => setLocalReasoningModel(e.target.value)}
                  placeholder="deepseek-r1"
                  className="input font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1">
                Embedding Model
              </label>
              <input
                type="text"
                value={localEmbedModel}
                onChange={(e) => setLocalEmbedModel(e.target.value)}
                placeholder="nomic-embed-text"
                className="input max-w-xs font-mono text-sm"
              />
            </div>

            <div className="flex items-center gap-3 pt-4">
              <button
                onClick={handleSaveOllama}
                disabled={aiSaving}
                className="flex items-center gap-2 px-4 py-2 bg-honey-500 hover:bg-honey-600 text-nog-900 font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {aiSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save Ollama Settings
              </button>
              <button
                onClick={testAiConnection}
                disabled={aiTesting}
                className="flex items-center gap-2 px-4 py-2 border border-nog-300 dark:border-nog-600 text-nog-700 dark:text-nog-300 font-medium rounded-lg hover:bg-nog-50 dark:hover:bg-nog-700 transition-colors disabled:opacity-50"
              >
                {aiTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Test Connection
              </button>
            </div>

            {aiTestResult && (
              <div className={`mt-4 p-4 rounded-lg border ${
                aiTestResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
                {aiTestResult.success ? (
                  <>
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                      <Check className="w-4 h-4" />
                      <span className="font-medium">Connected to Ollama</span>
                    </div>
                    {aiTestResult.models_available?.length > 0 && (
                      <div className="text-sm text-green-600 dark:text-green-400">
                        Available models: {aiTestResult.models_available.slice(0, 5).join(', ')}
                        {aiTestResult.models_available.length > 5 && ` (+${aiTestResult.models_available.length - 5} more)`}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                    <AlertCircle className="w-4 h-4" />
                    <span>{aiTestResult.error}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* OpenRouter Configuration */}
      <section className="bg-white dark:bg-nog-800 rounded-xl shadow-sm border border-nog-200 dark:border-nog-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-nog-900 dark:text-nog-100 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            OpenRouter Configuration
          </h2>
          {aiSaveSuccess && (
            <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <Check className="w-4 h-4" />
              Saved
            </span>
          )}
        </div>

        <p className="text-sm text-nog-500 dark:text-nog-400 mb-6">
          Configure OpenRouter for cloud-based AI models. Use as fallback or alternative to local Ollama.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1">
              API Key
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                name="openrouter-api-key"
                autoComplete="off"
                value={localOpenrouterKey}
                onChange={(e) => setLocalOpenrouterKey(e.target.value)}
                placeholder={aiConfig?.openrouter?.api_key_set ? '••••••••' : 'Enter API key'}
                className="input flex-1 font-mono text-sm"
              />
              {aiConfig?.openrouter?.api_key_set && (
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded">
                  Set
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-nog-700 dark:text-nog-300 mb-1">
              Model
            </label>
            <input
              type="text"
              value={localOpenrouterModel}
              onChange={(e) => setLocalOpenrouterModel(e.target.value)}
              placeholder="anthropic/claude-3.5-sonnet"
              className="input font-mono text-sm"
            />
            <p className="mt-1 text-xs text-nog-500 dark:text-nog-400">
              See <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-honey-500 hover:underline">openrouter.ai/models</a> for available models
            </p>
          </div>

          <button
            onClick={handleSaveOpenrouter}
            disabled={aiSaving}
            className="flex items-center gap-2 px-4 py-2 bg-honey-500 hover:bg-honey-600 text-nog-900 font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {aiSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save OpenRouter Settings
          </button>
        </div>
      </section>
    </div>
  );
}
