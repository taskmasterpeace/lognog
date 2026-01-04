import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  Send,
  Globe,
  Server,
  Monitor,
  Cloud,
  Triangle,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Plus,
} from 'lucide-react';
import {
  getApiKeys,
  createApiKey,
  validateIngestion,
  sendTestEvent,
  ValidationResult,
  ApiKey,
} from '../api/client';

interface AddDataSourceWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type SourceType = 'http' | 'syslog' | 'agent' | 'supabase' | 'vercel' | null;
type TestStatus = 'idle' | 'sending' | 'success' | 'error';

const SOURCE_TYPES = [
  {
    id: 'http' as const,
    name: 'HTTP / JSON',
    description: 'Send JSON logs via HTTP POST',
    icon: Globe,
    popular: true,
  },
  {
    id: 'syslog' as const,
    name: 'Syslog',
    description: 'UDP/TCP syslog from routers, firewalls',
    icon: Server,
    popular: false,
  },
  {
    id: 'agent' as const,
    name: 'LogNog Agent',
    description: 'Windows/Linux agent for files & events',
    icon: Monitor,
    popular: false,
  },
  {
    id: 'supabase' as const,
    name: 'Supabase',
    description: 'Supabase Log Drains integration',
    icon: Cloud,
    popular: false,
  },
  {
    id: 'vercel' as const,
    name: 'Vercel',
    description: 'Vercel Log Drains integration',
    icon: Triangle,
    popular: false,
  },
];

// Code snippet templates
function generateCurlSnippet(apiKey: string, indexName: string): string {
  const endpoint = `${window.location.origin}/api/ingest/http`;
  return `curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey}" \\${indexName ? `\n  -H "X-Index: ${indexName}" \\` : ''}
  -d '[{
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "message": "Hello from curl",
    "level": "info"
  }]'`;
}

function generateNodeSnippet(apiKey: string, indexName: string): string {
  const endpoint = `${window.location.origin}/api/ingest/http`;
  return `const response = await fetch('${endpoint}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '${apiKey}',${indexName ? `\n    'X-Index': '${indexName}',` : ''}
  },
  body: JSON.stringify([{
    timestamp: new Date().toISOString(),
    message: 'Hello from Node.js',
    level: 'info',
    // Add your custom fields here
  }]),
});

console.log(await response.json());`;
}

function generatePythonSnippet(apiKey: string, indexName: string): string {
  const endpoint = `${window.location.origin}/api/ingest/http`;
  return `import requests
import datetime

response = requests.post(
    '${endpoint}',
    headers={
        'Content-Type': 'application/json',
        'X-API-Key': '${apiKey}',${indexName ? `\n        'X-Index': '${indexName}',` : ''}
    },
    json=[{
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
        'message': 'Hello from Python',
        'level': 'info',
        # Add your custom fields here
    }]
)

print(response.json())`;
}

function generateGoSnippet(apiKey: string, indexName: string): string {
  const endpoint = `${window.location.origin}/api/ingest/http`;
  return `package main

import (
    "bytes"
    "encoding/json"
    "net/http"
    "time"
)

func main() {
    logs := []map[string]interface{}{
        {
            "timestamp": time.Now().UTC().Format(time.RFC3339),
            "message":   "Hello from Go",
            "level":     "info",
        },
    }

    body, _ := json.Marshal(logs)
    req, _ := http.NewRequest("POST", "${endpoint}", bytes.NewBuffer(body))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-API-Key", "${apiKey}")${indexName ? `\n    req.Header.Set("X-Index", "${indexName}")` : ''}

    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
}`;
}

export default function AddDataSourceWizard({ isOpen, onClose, onComplete }: AddDataSourceWizardProps) {
  const [step, setStep] = useState(1);
  const [sourceType, setSourceType] = useState<SourceType>(null);
  const [selectedApiKey, setSelectedApiKey] = useState<string>('');
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);
  const [indexName, setIndexName] = useState('');
  const [sampleJson, setSampleJson] = useState('{\n  "user": "john@example.com",\n  "action": "login",\n  "duration_ms": 150,\n  "success": true\n}');
  const [previewResult, setPreviewResult] = useState<ValidationResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testError, setTestError] = useState<string | null>(null);
  const [activeSnippet, setActiveSnippet] = useState<'curl' | 'nodejs' | 'python' | 'go'>('curl');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  // Fetch API keys
  const { data: apiKeys, refetch: refetchApiKeys } = useQuery({
    queryKey: ['api-keys'],
    queryFn: getApiKeys,
    enabled: isOpen,
  });

  // Reset state when wizard opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSourceType(null);
      setSelectedApiKey('');
      setIndexName('');
      setSampleJson('{\n  "user": "john@example.com",\n  "action": "login",\n  "duration_ms": 150,\n  "success": true\n}');
      setPreviewResult(null);
      setPreviewError(null);
      setTestStatus('idle');
      setTestError(null);
      setActiveSnippet('curl');
    }
  }, [isOpen]);

  // Auto-select first API key
  useEffect(() => {
    if (apiKeys && apiKeys.length > 0 && !selectedApiKey) {
      const activeKeys = apiKeys.filter((k: ApiKey) => !k.revoked);
      if (activeKeys.length > 0) {
        // We need the full key, but we only have the prefix stored
        // For now, we'll prompt the user to create a new key if needed
      }
    }
  }, [apiKeys, selectedApiKey]);

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handlePreview = async () => {
    setValidating(true);
    setPreviewError(null);
    try {
      const payload = JSON.parse(sampleJson);
      const result = await validateIngestion(payload);
      setPreviewResult(result);
    } catch (error) {
      if (error instanceof SyntaxError) {
        setPreviewError('Invalid JSON: ' + error.message);
      } else {
        setPreviewError(error instanceof Error ? error.message : 'Validation failed');
      }
      setPreviewResult(null);
    } finally {
      setValidating(false);
    }
  };

  const handleSendTest = async () => {
    if (!selectedApiKey) {
      setTestError('Please select or create an API key first');
      return;
    }

    setTestStatus('sending');
    setTestError(null);
    try {
      const payload = JSON.parse(sampleJson);
      await sendTestEvent(payload, selectedApiKey);
      setTestStatus('success');
    } catch (error) {
      setTestStatus('error');
      setTestError(error instanceof Error ? error.message : 'Failed to send test event');
    }
  };

  const handleCreateApiKey = async () => {
    if (!newApiKeyName.trim()) return;

    setCreatingKey(true);
    try {
      const result = await createApiKey(newApiKeyName.trim(), ['ingest']);
      setSelectedApiKey(result.apiKey);
      setShowCreateKey(false);
      setNewApiKeyName('');
      refetchApiKeys();
    } catch (error) {
      console.error('Failed to create API key:', error);
    } finally {
      setCreatingKey(false);
    }
  };

  const getEndpointUrl = () => {
    const base = window.location.origin;
    switch (sourceType) {
      case 'http': return `${base}/api/ingest/http`;
      case 'supabase': return `${base}/api/ingest/supabase`;
      case 'vercel': return `${base}/api/ingest/vercel`;
      default: return `${base}/api/ingest/http`;
    }
  };

  const getCodeSnippet = () => {
    switch (activeSnippet) {
      case 'curl': return generateCurlSnippet(selectedApiKey || 'YOUR_API_KEY', indexName);
      case 'nodejs': return generateNodeSnippet(selectedApiKey || 'YOUR_API_KEY', indexName);
      case 'python': return generatePythonSnippet(selectedApiKey || 'YOUR_API_KEY', indexName);
      case 'go': return generateGoSnippet(selectedApiKey || 'YOUR_API_KEY', indexName);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header with Logo */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/lognotext.png"
              alt="LogNog"
              className="h-8"
              onError={(e) => {
                // Fallback to logo.png if lognotext.png doesn't exist
                (e.target as HTMLImageElement).src = '/logo.png';
                (e.target as HTMLImageElement).className = 'h-8 w-8';
              }}
            />
            <div className="h-6 w-px bg-slate-300 dark:bg-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Add Data Source
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Progress Indicator */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-medium transition-colors ${
                    s === step
                      ? 'bg-amber-500 text-white'
                      : s < step
                      ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                  }`}
                >
                  {s < step ? <Check className="w-4 h-4" /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`w-12 h-0.5 mx-1 ${
                      s < step ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-600'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-2">
            Step {step} of 3:{' '}
            {step === 1 && 'Choose Type'}
            {step === 2 && 'Configure'}
            {step === 3 && 'Test & Code Snippets'}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Choose Source Type */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                Select how you want to send logs to LogNog:
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {SOURCE_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setSourceType(type.id)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      sourceType === type.id
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <type.icon
                        className={`w-8 h-8 ${
                          sourceType === type.id ? 'text-amber-500' : 'text-slate-400'
                        }`}
                      />
                      {type.popular && (
                        <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">
                          Popular
                        </span>
                      )}
                    </div>
                    <h3
                      className={`font-semibold mb-1 ${
                        sourceType === type.id
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {type.name}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {type.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Configure */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Endpoint URL */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Endpoint URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={getEndpointUrl()}
                    readOnly
                    className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 font-mono text-sm"
                  />
                  <button
                    onClick={() => handleCopy(getEndpointUrl(), 'endpoint')}
                    className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    {copiedSection === 'endpoint' ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <Copy className="w-5 h-5 text-slate-500" />
                    )}
                  </button>
                </div>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  API Key
                </label>
                {showCreateKey ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newApiKeyName}
                      onChange={(e) => setNewApiKeyName(e.target.value)}
                      placeholder="Enter key name (e.g., my-app)"
                      className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                    <button
                      onClick={handleCreateApiKey}
                      disabled={creatingKey || !newApiKeyName.trim()}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg flex items-center gap-2"
                    >
                      {creatingKey ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Create
                    </button>
                    <button
                      onClick={() => setShowCreateKey(false)}
                      className="px-4 py-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                ) : selectedApiKey ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={selectedApiKey}
                      readOnly
                      className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 font-mono text-sm"
                    />
                    <button
                      onClick={() => handleCopy(selectedApiKey, 'apikey')}
                      className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                    >
                      {copiedSection === 'apikey' ? (
                        <Check className="w-5 h-5 text-green-500" />
                      ) : (
                        <Copy className="w-5 h-5 text-slate-500" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedApiKey('');
                        setShowCreateKey(true);
                      }}
                      className="text-sm text-amber-500 hover:text-amber-600"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCreateKey(true)}
                      className="flex-1 px-4 py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400 hover:border-amber-500 hover:text-amber-500 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Create New API Key
                    </button>
                  </div>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  API keys are used to authenticate your log ingestion requests
                </p>
              </div>

              {/* Index Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Index Name <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={indexName}
                  onChange={(e) => setIndexName(e.target.value)}
                  placeholder="e.g., my-app"
                  className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
                {indexName && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Logs will be searchable as: <code className="bg-amber-50 dark:bg-amber-900/30 px-1 rounded">search index={indexName}</code>
                  </p>
                )}
              </div>

              {/* Syslog-specific info */}
              {sourceType === 'syslog' && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <h4 className="font-medium text-amber-700 dark:text-amber-300 mb-2">Syslog Configuration</h4>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    LogNog listens for syslog on <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">UDP/TCP port 514</code>
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                    Point your routers, firewalls, or servers to send syslog to your LogNog server.
                  </p>
                </div>
              )}

              {/* Agent-specific info */}
              {sourceType === 'agent' && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <h4 className="font-medium text-amber-700 dark:text-amber-300 mb-2">LogNog In Agent</h4>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Download the LogNog In agent for Windows or Linux to collect log files and Windows Event Logs.
                  </p>
                  <a
                    href="https://github.com/machinekinglabs/lognog/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 mt-2"
                  >
                    Download Agent
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Test & Code Snippets */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Sample JSON */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Paste sample JSON to preview extracted fields:
                </label>
                <textarea
                  value={sampleJson}
                  onChange={(e) => {
                    setSampleJson(e.target.value);
                    setPreviewResult(null);
                    setPreviewError(null);
                  }}
                  rows={6}
                  className="w-full px-4 py-3 font-mono text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Preview Button & Results */}
              <div className="flex items-center gap-4">
                <button
                  onClick={handlePreview}
                  disabled={validating}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg flex items-center gap-2"
                >
                  {validating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Preview Fields
                </button>

                <button
                  onClick={handleSendTest}
                  disabled={testStatus === 'sending' || !selectedApiKey}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg flex items-center gap-2"
                >
                  {testStatus === 'sending' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send Test Event
                </button>

                {testStatus === 'success' && (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Event received! View in Search
                  </span>
                )}
                {testStatus === 'error' && testError && (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    {testError}
                  </span>
                )}
              </div>

              {/* Preview Results */}
              {previewError && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4 inline-block mr-2" />
                  {previewError}
                </div>
              )}

              {previewResult && (
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-3">
                  <h4 className="font-medium text-slate-700 dark:text-slate-300">Extracted Fields:</h4>

                  {/* Standard Fields */}
                  <div className="space-y-2">
                    {Object.entries(previewResult.extracted.standard_fields).map(([key, field]) => (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        {field.value ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                        )}
                        <span className="font-mono text-slate-600 dark:text-slate-400">{key}</span>
                        <span className="text-slate-400">:</span>
                        <span className="text-slate-900 dark:text-slate-100">
                          {field.value !== null ? String(field.value) : '(not detected)'}
                        </span>
                        {field.detected_from && (
                          <span className="text-xs text-slate-400">
                            from {field.detected_from}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Custom Fields */}
                  {previewResult.extracted.custom_field_count > 0 && (
                    <>
                      <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                        <h5 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                          Custom Fields ({previewResult.extracted.custom_field_count}):
                        </h5>
                        <div className="space-y-1">
                          {Object.entries(previewResult.extracted.custom_fields).map(([key, field]) => (
                            <div key={key} className="flex items-center gap-2 text-sm">
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                              <span className="font-mono text-slate-600 dark:text-slate-400">{key}</span>
                              <span className="text-xs text-slate-400">({field.type})</span>
                              <span className="text-slate-400">:</span>
                              <span className="text-slate-900 dark:text-slate-100">
                                {JSON.stringify(field.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Warnings */}
                  {previewResult.warnings.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                      {previewResult.warnings.map((warning, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                          <AlertCircle className="w-4 h-4" />
                          {warning}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Code Snippets */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-3">Code Snippets:</h4>
                <div className="flex gap-2 mb-3">
                  {(['curl', 'nodejs', 'python', 'go'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setActiveSnippet(lang)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                        activeSnippet === lang
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {lang === 'nodejs' ? 'Node.js' : lang.charAt(0).toUpperCase() + lang.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <pre className="bg-slate-900 dark:bg-black rounded-lg p-4 overflow-x-auto text-sm text-slate-100 font-mono">
                    {getCodeSnippet()}
                  </pre>
                  <button
                    onClick={() => handleCopy(getCodeSnippet(), 'snippet')}
                    className="absolute top-3 right-3 p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    {copiedSection === 'snippet' ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-300" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Cancel
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !sourceType}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg"
              >
                <Check className="w-4 h-4" />
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
