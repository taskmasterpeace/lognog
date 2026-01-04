import { useState } from 'react';
import { X, Upload, Palette } from 'lucide-react';

interface DashboardBranding {
  logo_url?: string;
  logo_position?: 'left' | 'center' | 'right';
  accent_color?: string;
  header_color?: string;
  description?: string;
}

interface DashboardBrandingModalProps {
  branding: DashboardBranding;
  onSave: (branding: DashboardBranding) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function DashboardBrandingModal({
  branding,
  onSave,
  onCancel,
  saving = false,
}: DashboardBrandingModalProps) {
  const [logoUrl, setLogoUrl] = useState(branding.logo_url || '');
  const [logoPosition, setLogoPosition] = useState<'left' | 'center' | 'right'>(
    branding.logo_position || 'left'
  );
  const [accentColor, setAccentColor] = useState(branding.accent_color || '#0ea5e9');
  const [headerColor, setHeaderColor] = useState(branding.header_color || '#ffffff');
  const [description, setDescription] = useState(branding.description || '');

  const handleSubmit = () => {
    onSave({
      logo_url: logoUrl || undefined,
      logo_position: logoPosition,
      accent_color: accentColor,
      header_color: headerColor,
      description: description || undefined,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal animate-slide-up max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Dashboard Branding
              </h3>
            </div>
            <button onClick={onCancel} className="btn-ghost p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="modal-body space-y-4">
          {/* Logo URL */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Logo URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="input flex-1"
              />
              <button className="btn-secondary">
                <Upload className="w-4 h-4" />
              </button>
            </div>
            {logoUrl && (
              <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  className="h-12 w-auto object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>

          {/* Logo Position */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Logo Position
            </label>
            <div className="flex gap-2">
              {(['left', 'center', 'right'] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => setLogoPosition(pos)}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    logoPosition === pos
                      ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {pos.charAt(0).toUpperCase() + pos.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Accent Color
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-slate-200"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="input flex-1 font-mono text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Header Background
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={headerColor}
                  onChange={(e) => setHeaderColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-slate-200"
                />
                <input
                  type="text"
                  value={headerColor}
                  onChange={(e) => setHeaderColor(e.target.value)}
                  className="input flex-1 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dashboard description..."
              rows={2}
              className="input resize-none"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Branding'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DashboardBrandingModal;
