import { useState } from 'react';
import { findDashboardBrand, findProjectBrand } from '../utils/projectBrands';

interface ProjectLogoProps {
  /** app_name, app_scope or project slug. */
  value?: string | null;
  /** 'dashboard' also accepts the studio's own dashboard group names (Game, Studio, Main Suite). */
  kind?: 'app' | 'dashboard';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = { xs: 'w-5 h-5', sm: 'w-7 h-7', md: 'w-10 h-10', lg: 'w-14 h-14' };

/** The product's logo in a small rounded tile. Renders nothing for unknown apps. */
export function ProjectLogo({ value, kind = 'app', size = 'sm', className = '' }: ProjectLogoProps) {
  const brand = kind === 'dashboard' ? findDashboardBrand(value) : findProjectBrand(value);
  const [broken, setBroken] = useState(false);
  if (!brand || broken) return null;
  return (
    <span
      className={`${SIZES[size]} shrink-0 inline-flex items-center justify-center rounded-md overflow-hidden ${
        brand.lightPlate ? 'bg-nog-50' : 'bg-nog-900'
      } ${className}`}
      style={{ boxShadow: `inset 0 0 0 1px ${brand.accent}66` }}
      title={brand.name}
    >
      <img
        src={brand.logo}
        alt={`${brand.name} logo`}
        className="w-full h-full object-contain p-0.5"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    </span>
  );
}

export default ProjectLogo;
