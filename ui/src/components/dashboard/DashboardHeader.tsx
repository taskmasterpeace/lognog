import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Readable title color for a custom header background: relative luminance of
 * the hex picks espresso (nog-800) on light backgrounds or cream (nog-50) on
 * dark ones. Returns undefined for non-hex values so callers keep the theme
 * default.
 */
export function headerTextColor(color: string): string | undefined {
  const m = color.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return undefined;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#2D1F13' : '#FAF8F5';
}

export interface DashboardHeaderProps {
  name: string;
  description?: string;
  logoUrl?: string;
  accentColor?: string;
  headerColor?: string;
  backLink?: string;
  actions?: React.ReactNode;
}

export function DashboardHeader({
  name,
  description,
  logoUrl,
  accentColor,
  headerColor,
  backLink,
  actions,
}: DashboardHeaderProps) {
  const headerStyle = headerColor
    ? { backgroundColor: headerColor }
    : {};

  const accentStyle = accentColor
    ? { borderColor: accentColor }
    : {};

  // A custom header background ignores the theme, so the theme-based text
  // classes can't be trusted (near-white on a white header in dark mode).
  // Derive a readable color from the background's luminance instead.
  const titleColor = headerColor ? headerTextColor(headerColor) : undefined;

  return (
    <div
      className="dashboard-header px-4 py-3 border-b-2 transition-colors bg-white dark:bg-nog-800"
      style={{ ...headerStyle, ...accentStyle }}
    >
      {/* Title block must be allowed to shrink (min-w-0) or a long description
          wraps into a tall column and squashes the toolbar beside it. */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-1 min-w-[14rem] max-w-full">
          {backLink && (
            <Link
              to={backLink}
              className="p-2 text-nog-400 hover:text-nog-600 dark:hover:text-nog-300 hover:bg-nog-100 dark:hover:bg-nog-700 rounded-lg transition-colors flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
          )}

          {logoUrl && (
            <img
              src={logoUrl}
              alt="Dashboard logo"
              className="h-10 w-auto max-w-[6rem] object-contain flex-shrink-0"
            />
          )}

          <div className="min-w-0">
            <h1
              className="text-xl font-bold text-nog-900 dark:text-nog-100 truncate"
              style={titleColor ? { color: titleColor } : undefined}
              title={name}
            >
              {name}
            </h1>
            {description && (
              <p
                className="text-sm text-nog-500 dark:text-nog-400 mt-0.5 truncate"
                style={titleColor ? { color: titleColor, opacity: 0.75 } : undefined}
                title={description}
              >
                {description}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2 flex-wrap justify-end ml-auto">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardHeader;
