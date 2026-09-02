import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

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
            <h1 className="text-xl font-bold text-nog-900 dark:text-nog-100 truncate" title={name}>
              {name}
            </h1>
            {description && (
              <p className="text-sm text-nog-500 dark:text-nog-400 mt-0.5 truncate" title={description}>
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
