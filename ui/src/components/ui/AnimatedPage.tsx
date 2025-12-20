import { ReactNode } from 'react';

interface AnimatedPageProps {
  children: ReactNode;
  className?: string;
}

/**
 * AnimatedPage - Wrapper component for page transitions
 *
 * Provides smooth fade-in and slide-up animations when navigating between pages.
 * Respects prefers-reduced-motion for accessibility.
 */
export default function AnimatedPage({ children, className = '' }: AnimatedPageProps) {
  return (
    <div className={`animate-page-enter ${className}`}>
      {children}
    </div>
  );
}
