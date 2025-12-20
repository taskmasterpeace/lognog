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
      className="dashboard-header px-4 py-3 border-b-2 transition-colors bg-white dark:bg-slate-800"
      style={{ ...headerStyle, ...accentStyle }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {backLink && (
            <Link
              to={backLink}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
          )}

          {logoUrl && (
            <img
              src={logoUrl}
              alt="Dashboard logo"
              className="h-10 w-auto object-contain"
            />
          )}

          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {name}
            </h1>
            {description && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardHeader;
