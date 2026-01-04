import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
  format?: (value: number) => string;
}

/**
 * AnimatedCounter - Smoothly animates number changes
 *
 * Perfect for statistics, metrics, and counts that update frequently.
 * Uses requestAnimationFrame for smooth 60fps animations.
 */
export default function AnimatedCounter({
  value,
  duration = 800,
  className = '',
  format = (n) => n.toLocaleString(),
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const rafRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const startValueRef = useRef<number>(value);

  useEffect(() => {
    if (value === displayValue) return;

    setIsAnimating(true);
    startValueRef.current = displayValue;
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const diff = value - startValueRef.current;
      const current = startValueRef.current + diff * easeProgress;

      setDisplayValue(Math.round(current));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
        setIsAnimating(false);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, duration, displayValue]);

  return (
    <span className={`${className} ${isAnimating ? 'text-amber-600 dark:text-amber-400' : ''} transition-colors duration-200`}>
      {format(displayValue)}
    </span>
  );
}
