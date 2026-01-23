interface Logo {
  url: string;
  label?: string;
}

interface MultiLogoIconProps {
  logos: Logo[];
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
};

export function MultiLogoIcon({ logos, size = 'md' }: MultiLogoIconProps) {
  const containerClass = sizeClasses[size];

  if (logos.length === 0) {
    return (
      <div className={`${containerClass} bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center`}>
        <span className="text-xs text-slate-400">?</span>
      </div>
    );
  }

  if (logos.length === 1) {
    // Single logo - full size
    return (
      <div className={`${containerClass} rounded-lg overflow-hidden bg-white dark:bg-slate-800 shadow-sm`}>
        <img
          src={logos[0].url}
          alt={logos[0].label || 'Logo'}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  if (logos.length === 2) {
    // Two logos - side by side
    return (
      <div className={`${containerClass} rounded-lg overflow-hidden flex gap-0.5`}>
        {logos.slice(0, 2).map((logo, i) => (
          <div key={i} className="flex-1 bg-white dark:bg-slate-800 shadow-sm">
            <img
              src={logo.url}
              alt={logo.label || `Logo ${i + 1}`}
              className="w-full h-full object-contain"
            />
          </div>
        ))}
      </div>
    );
  }

  if (logos.length === 3) {
    // Three logos - 2 top, 1 bottom spanning full width
    return (
      <div className={`${containerClass} rounded-lg overflow-hidden flex flex-col gap-0.5`}>
        <div className="flex gap-0.5 flex-1">
          {logos.slice(0, 2).map((logo, i) => (
            <div key={i} className="flex-1 bg-white dark:bg-slate-800 shadow-sm">
              <img
                src={logo.url}
                alt={logo.label || `Logo ${i + 1}`}
                className="w-full h-full object-contain"
              />
            </div>
          ))}
        </div>
        <div className="flex-1 bg-white dark:bg-slate-800 shadow-sm">
          <img
            src={logos[2].url}
            alt={logos[2].label || 'Logo 3'}
            className="w-full h-full object-contain"
          />
        </div>
      </div>
    );
  }

  // Four or more logos - 2x2 grid
  return (
    <div className={`${containerClass} rounded-lg overflow-hidden grid grid-cols-2 gap-0.5`}>
      {logos.slice(0, 4).map((logo, i) => (
        <div key={i} className="bg-white dark:bg-slate-800 shadow-sm">
          <img
            src={logo.url}
            alt={logo.label || `Logo ${i + 1}`}
            className="w-full h-full object-contain"
          />
        </div>
      ))}
    </div>
  );
}

export default MultiLogoIcon;
