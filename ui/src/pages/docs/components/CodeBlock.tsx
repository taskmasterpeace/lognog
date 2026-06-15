import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-nog-900 dark:bg-nog-950 text-slate-100 p-3 sm:p-4 rounded-lg overflow-x-auto text-xs sm:text-sm font-mono">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 p-1.5 sm:p-2 bg-nog-800 rounded-md opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-slate-700"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400" />
        ) : (
          <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
        )}
      </button>
    </div>
  );
}
