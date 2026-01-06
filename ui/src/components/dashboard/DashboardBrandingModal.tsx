import { useState, useRef } from 'react';
import { X, Palette, Image, AlertCircle } from 'lucide-react';

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

const MAX_FILE_SIZE = 500 * 1024; // 500KB max for base64 logos
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    // Validate file type
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUploadError('Please select a valid image file (PNG, JPEG, GIF, WebP, or SVG)');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`Image must be smaller than ${MAX_FILE_SIZE / 1024}KB`);
      return;
    }

    setUploading(true);
    try {
      const base64 = await readFileAsBase64(file);
      setLogoUrl(base64);
    } catch {
      setUploadError('Failed to read image file');
    } finally {
      setUploading(false);
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
    setUploadError(null);
  };

  const isBase64Logo = logoUrl.startsWith('data:image/');

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
          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Logo
            </label>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              onChange={handleFileSelect}
              className="hidden"
            />

            {logoUrl ? (
              /* Logo Preview */
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-lg p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-20 h-20 bg-nog-100 dark:bg-nog-700 rounded-lg flex items-center justify-center overflow-hidden">
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '';
                        (e.target as HTMLImageElement).alt = 'Failed to load';
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {isBase64Logo ? 'Uploaded image' : 'External URL'}
                    </p>
                    {!isBase64Logo && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={logoUrl}>
                        {logoUrl}
                      </p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 font-medium"
                        disabled={uploading}
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Upload Area */
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-lg p-6 hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors group"
              >
                <div className="flex flex-col items-center gap-2">
                  {uploading ? (
                    <>
                      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-slate-500 dark:text-slate-400">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 bg-nog-100 dark:bg-nog-700 rounded-full flex items-center justify-center group-hover:bg-amber-100 dark:group-hover:bg-amber-900/30 transition-colors">
                        <Image className="w-6 h-6 text-slate-400 group-hover:text-amber-500 transition-colors" />
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Click to upload logo
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          PNG, JPEG, GIF, WebP, or SVG (max 500KB)
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </button>
            )}

            {/* Error message */}
            {uploadError && (
              <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Or use URL */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  const url = prompt('Enter logo URL:', logoUrl);
                  if (url !== null) {
                    setLogoUrl(url);
                    setUploadError(null);
                  }
                }}
                className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              >
                Or enter URL manually →
              </button>
            </div>
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
