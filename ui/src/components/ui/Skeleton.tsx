import { ReactNode } from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'shimmer' | 'none';
}

/**
 * Skeleton - Loading placeholder component with shimmer animation
 *
 * Provides visual feedback while content is loading.
 * Supports multiple variants and animation types.
 */
export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  animation = 'shimmer',
}: SkeletonProps) {
  const baseStyles = 'bg-slate-200 dark:bg-slate-700';
  const animationClass =
    animation === 'shimmer'
      ? 'animate-shimmer'
      : animation === 'pulse'
      ? 'animate-skeleton'
      : '';

  const variantStyles = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style: React.CSSProperties = {
    width: width || undefined,
    height: height || undefined,
  };

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${animationClass} ${className}`}
      style={style}
    />
  );
}

/**
 * SkeletonGroup - Grouped skeleton elements for complex loading states
 */
interface SkeletonGroupProps {
  children: ReactNode;
  className?: string;
}

export function SkeletonGroup({ children, className = '' }: SkeletonGroupProps) {
  return <div className={`space-y-3 ${className}`}>{children}</div>;
}

/**
 * Pre-built skeleton layouts for common use cases
 */

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`card p-6 ${className}`}>
      <SkeletonGroup>
        <Skeleton variant="text" width="60%" height={24} />
        <Skeleton variant="text" width="40%" height={16} />
        <div className="mt-4 space-y-2">
          <Skeleton variant="text" width="100%" />
          <Skeleton variant="text" width="90%" />
          <Skeleton variant="text" width="95%" />
        </div>
      </SkeletonGroup>
    </div>
  );
}

export function SkeletonTable({ rows = 5, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`card overflow-hidden ${className}`}>
      <div className="p-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <Skeleton variant="text" width="30%" height={20} />
      </div>
      <div className="divide-y divide-slate-200 dark:divide-slate-700">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex items-center gap-4">
            <Skeleton variant="circular" width={40} height={40} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="40%" height={16} />
              <Skeleton variant="text" width="60%" height={14} />
            </div>
            <Skeleton variant="rectangular" width={80} height={32} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ items = 5, className = '' }: { items?: number; className?: string }) {
  return (
    <SkeletonGroup className={className}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <Skeleton variant="circular" width={32} height={32} />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="50%" height={14} />
            <Skeleton variant="text" width="30%" height={12} />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

export function SkeletonChart({ className = '' }: { className?: string }) {
  return (
    <div className={`card p-6 ${className}`}>
      <SkeletonGroup>
        <Skeleton variant="text" width="40%" height={24} />
        <div className="mt-6 flex items-end gap-2 h-48">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={i}
              variant="rectangular"
              className="flex-1"
              height={Math.random() * 150 + 50}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Skeleton variant="text" width="20%" height={14} />
          <Skeleton variant="text" width="20%" height={14} />
        </div>
      </SkeletonGroup>
    </div>
  );
}

export default Skeleton;
