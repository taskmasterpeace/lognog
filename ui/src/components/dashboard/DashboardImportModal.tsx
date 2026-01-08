import { useState, useCallback } from 'react';
import { X, Upload, FileJson, Loader2, Check, AlertCircle, LayoutGrid, Variable, Palette } from 'lucide-react';
import { DashboardExport } from '../../api/client';

interface DashboardImportModalProps {
  onImport: (template: DashboardExport, name?: string) => void;
  onCancel: () => void;
  importing?: boolean;
}

export function DashboardImportModal({
  onImport,
  onCancel,
  importing = false,
}: DashboardImportModalProps) {
  const [template, setTemplate] = useState<DashboardExport | null>(null);
  const [customName, setCustomName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const parseJson = useCallback((text: string) => {
    try {
      const parsed = JSON.parse(text) as DashboardExport;

      // Validate required fields
      if (!parsed.name || !parsed.panels) {
        throw new Error('Invalid dashboard format: missing name or panels');
      }

      if (!Array.isArray(parsed.panels)) {
        throw new Error('Invalid dashboard format: panels must be an array');
      }

      setTemplate(parsed);
      setCustomName(parsed.name);
      setError(null);
      setJsonText(text);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse JSON');
      setTemplate(null);
      return false;
    }
  }, []);

  const handleFileRead = useCallback((file: File) => {
    if (!file.name.endsWith('.json')) {
      setError('Please select a JSON file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseJson(text);
    };
    reader.onerror = () => {
      setError('Failed to read file');
    };
    reader.readAsText(file);
  }, [parseJson]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileRead(file);
    }
  }, [handleFileRead]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileRead(file);
    }
  }, [handleFileRead]);

  const handleJsonPaste = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setJsonText(text);
    if (text.trim()) {
      parseJson(text);
    } else {
      setTemplate(null);
      setError(null);
    }
  }, [parseJson]);

  const handleImport = () => {
    if (template) {
      onImport(template, customName !== template.name ? customName : undefined);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Import Dashboard
              </h3>
            </div>
            <button onClick={onCancel} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="modal-body space-y-4">
          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
              ${isDragOver
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                : 'border-slate-300 dark:border-slate-600 hover:border-amber-400 dark:hover:border-amber-500'
              }
            `}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".json"
              onChange={handleFileInput}
              className="hidden"
            />
            <FileJson className={`w-10 h-10 mx-auto mb-3 ${isDragOver ? 'text-amber-500' : 'text-slate-400'}`} />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Drag & drop a JSON file here
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              or click to browse
            </p>
          </div>

          {/* JSON Paste Area */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Or paste JSON
            </label>
            <textarea
              value={jsonText}
              onChange={handleJsonPaste}
              placeholder='{"name": "Dashboard", "panels": [...], ...}'
              rows={4}
              className="input font-mono text-xs resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Preview */}
          {template && (
            <div className="p-4 bg-nog-50 dark:bg-nog-800 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  Valid dashboard detected
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <LayoutGrid className="w-4 h-4" />
                  <span>{template.panels.length} panels</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Variable className="w-4 h-4" />
                  <span>{template.variables?.length || 0} variables</span>
                </div>
                {(template.logo_url || template.accent_color) && (
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 col-span-2">
                    <Palette className="w-4 h-4" />
                    <span>Custom branding included</span>
                    {template.accent_color && (
                      <span
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: template.accent_color }}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Rename */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Dashboard Name
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="input"
                  placeholder={template.name}
                />
              </div>

              {template.exported_at && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Exported: {new Date(template.exported_at).toLocaleDateString()}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!template || importing}
            className="btn-primary"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Import Dashboard
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DashboardImportModal;
