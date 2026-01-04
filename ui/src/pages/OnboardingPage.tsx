import { useState } from 'react';
import { Copy, Check, Bot, Sparkles, Code, Zap } from 'lucide-react';

const AI_ONBOARDING_PROMPT = `# LogNog Integration Task

You are helping integrate an application with LogNog, a centralized logging platform. Follow these instructions exactly.

## Endpoint Configuration

\`\`\`
URL: https://logs.machinekinglabs.com/api/ingest/http
Method: POST
Content-Type: application/json
\`\`\`

## Required Headers

| Header | Value |
|--------|-------|
| X-API-Key | [Get from LogNog Settings > API Keys] |
| X-App-Name | [your-app-name in kebab-case, e.g., "hey-youre-hired"] |
| X-Index | [same as X-App-Name] |
| Content-Type | application/json |

## Payload Format

Send logs as a JSON array:
\`\`\`json
[
  {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "level": "info",
    "message": "User logged in",
    "userId": "user_123",
    "...any other fields": "stored in structured_data"
  }
]
\`\`\`

## Level Mapping

| Your Level | LogNog Severity |
|------------|-----------------|
| debug | 7 |
| info | 6 |
| warn | 4 |
| error | 3 |

## Implementation (TypeScript/Node.js)

Create \`lib/lognog.ts\`:

\`\`\`typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

class LogNogClient {
  private buffer: LogEntry[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private isFlushing = false;

  // CRITICAL: Use getters for lazy loading!
  // Environment variables may not be available at module load time
  private get url() {
    return process.env.LOGNOG_URL || 'https://logs.machinekinglabs.com';
  }

  private get apiKey() {
    return process.env.LOGNOG_API_KEY || '';
  }

  private get appName() {
    return process.env.LOGNOG_APP_NAME || 'my-app';
  }

  private get index() {
    return process.env.LOGNOG_INDEX || this.appName;
  }

  log(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
    if (!this.apiKey) {
      console.warn('[LogNog] No API key configured');
      return;
    }

    this.buffer.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    });

    if (this.buffer.length >= 50) {
      this.flush();
    } else if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => this.flush(), 5000);
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.log('error', message, context);
  }

  async forceFlush(): Promise<void> {
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.buffer.length === 0 || this.isFlushing) return;

    this.isFlushing = true;
    const logs = [...this.buffer];
    this.buffer = [];

    try {
      const response = await fetch(\`\${this.url}/api/ingest/http\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-App-Name': this.appName,
          'X-Index': this.index,
        },
        body: JSON.stringify(logs),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(\`[LogNog] Error \${response.status}: \${text}\`);
        this.buffer.unshift(...logs); // Retry
      } else {
        const result = await response.json();
        console.log(\`[LogNog] Sent \${logs.length} logs:\`, result);
      }
    } catch (error) {
      console.error('[LogNog] Connection error:', error);
      this.buffer.unshift(...logs); // Retry
    } finally {
      this.isFlushing = false;
    }
  }
}

export const lognog = new LogNogClient();
export const flushLogs = () => lognog.forceFlush();
\`\`\`

## Environment Variables

Add to \`.env.local\`:
\`\`\`bash
LOGNOG_URL=https://logs.machinekinglabs.com
LOGNOG_API_KEY=lnog_your_key_here
LOGNOG_APP_NAME=your-app-name
LOGNOG_INDEX=your-app-name
\`\`\`

## Usage Examples

\`\`\`typescript
import { lognog, flushLogs } from './lib/lognog';

// Log events throughout your app
lognog.info('User signed up', { userId: 'user_123', plan: 'pro' });
lognog.error('Payment failed', { userId: 'user_456', errorCode: 'CARD_DECLINED' });
lognog.warn('Rate limit approaching', { endpoint: '/api/search', usage: 85 });

// CRITICAL: In scripts, force flush before exit
await flushLogs();
\`\`\`

## Critical Gotchas

1. **Lazy Loading**: Use getters for env vars, not constants at module level
2. **Force Flush**: Always call \`flushLogs()\` before script exit
3. **Import Order**: Load dotenv BEFORE importing lognog
4. **Batching**: Logs batch every 5s or 50 logs - don't expect instant delivery

## Test Command

\`\`\`bash
curl -X POST https://logs.machinekinglabs.com/api/ingest/http \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: $LOGNOG_API_KEY" \\
  -H "X-App-Name: your-app-name" \\
  -H "X-Index: your-app-name" \\
  -d '[{"level": "info", "message": "Test log"}]'

# Expected: {"accepted":1,"index":"your-app-name"}
\`\`\`

## Query Your Logs

After integration, search in LogNog:
\`\`\`
search index=your-app-name
search index=your-app-name severity<=3  # errors only
search index=your-app-name userId="user_123"
\`\`\`

Now implement this integration for the application.`;

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
        copied
          ? 'bg-green-500 text-white'
          : 'bg-amber-500 hover:bg-amber-600 text-white'
      }`}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="w-4 h-4" />
          {label || 'Copy'}
        </>
      )}
    </button>
  );
}

export default function OnboardingPage() {
  return (
    <div className="min-h-full bg-slate-50 dark:bg-nog-900">
      {/* Header */}
      <div className="bg-white dark:bg-nog-800 border-b border-slate-200 dark:border-nog-700 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-amber-500 rounded-xl">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-nog-100">
              AI Onboarding
            </h1>
          </div>
          <p className="text-slate-600 dark:text-nog-400">
            Copy these instructions and give them to any AI assistant to integrate your app with LogNog.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Quick Action */}
        <div className="bg-gradient-to-r from-amber-50 to-amber-50 dark:from-amber-900/20 dark:to-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white dark:bg-nog-800 rounded-lg shadow-sm">
                <Sparkles className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-nog-100 mb-1">
                  One-Click AI Integration
                </h2>
                <p className="text-sm text-slate-600 dark:text-nog-400">
                  Copy the prompt below and paste it into Claude, ChatGPT, or any AI assistant.
                  The AI will implement LogNog logging in your codebase.
                </p>
              </div>
            </div>
            <CopyButton text={AI_ONBOARDING_PROMPT} label="Copy AI Prompt" />
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <Code className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-slate-900 dark:text-nog-100">Complete Code</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-nog-400">
              Full TypeScript implementation with batching, retries, and error handling.
            </p>
          </div>
          <div className="bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <Zap className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-slate-900 dark:text-nog-100">Best Practices</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-nog-400">
              Includes critical gotchas like lazy loading and flush handling.
            </p>
          </div>
          <div className="bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <Bot className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-slate-900 dark:text-nog-100">AI-Optimized</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-nog-400">
              Structured for AI understanding with clear sections and examples.
            </p>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-nog-900 border-b border-slate-200 dark:border-nog-700">
            <span className="text-sm font-medium text-slate-700 dark:text-nog-300">
              AI Integration Prompt
            </span>
            <CopyButton text={AI_ONBOARDING_PROMPT} label="Copy" />
          </div>
          <div className="p-4 max-h-[500px] overflow-y-auto">
            <pre className="text-xs sm:text-sm text-slate-700 dark:text-nog-300 whitespace-pre-wrap font-mono">
              {AI_ONBOARDING_PROMPT}
            </pre>
          </div>
        </div>

        {/* How to Use */}
        <div className="mt-8 bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-nog-100 mb-4">
            How to Use
          </h2>
          <ol className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full flex items-center justify-center text-sm font-medium">
                1
              </span>
              <span className="text-slate-600 dark:text-nog-400">
                Click <strong>"Copy AI Prompt"</strong> above
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full flex items-center justify-center text-sm font-medium">
                2
              </span>
              <span className="text-slate-600 dark:text-nog-400">
                Open your AI assistant (Claude, ChatGPT, Cursor, etc.)
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full flex items-center justify-center text-sm font-medium">
                3
              </span>
              <span className="text-slate-600 dark:text-nog-400">
                Paste the prompt and tell the AI your app name (e.g., "my app is called directors-palette")
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full flex items-center justify-center text-sm font-medium">
                4
              </span>
              <span className="text-slate-600 dark:text-nog-400">
                The AI will create the logging client and integrate it into your codebase
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full flex items-center justify-center text-sm font-medium">
                5
              </span>
              <span className="text-slate-600 dark:text-nog-400">
                Get your API key from <strong>Settings → API Keys</strong> and add it to your .env file
              </span>
            </li>
          </ol>
        </div>

        {/* Current Integrations */}
        <div className="mt-8 bg-white dark:bg-nog-800 border border-slate-200 dark:border-nog-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-nog-100 mb-4">
            Current Integrations
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-nog-700">
                  <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-nog-300">App</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-nog-300">X-App-Name</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-700 dark:text-nog-300">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 dark:border-nog-700/50">
                  <td className="py-2 px-3 text-slate-900 dark:text-nog-100">Hey You're Hired</td>
                  <td className="py-2 px-3">
                    <code className="text-xs bg-slate-100 dark:bg-nog-900 px-2 py-0.5 rounded">
                      hey-youre-hired
                    </code>
                  </td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Live
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-nog-700/50">
                  <td className="py-2 px-3 text-slate-900 dark:text-nog-100">Directors Palette</td>
                  <td className="py-2 px-3">
                    <code className="text-xs bg-slate-100 dark:bg-nog-900 px-2 py-0.5 rounded">
                      directors-palette
                    </code>
                  </td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Pending
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
