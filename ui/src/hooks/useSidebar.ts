import { useState, useEffect, useCallback } from 'react';

const MOBILE_BREAKPOINT = 768; // Matches Tailwind's 'md' breakpoint

interface UseSidebarReturn {
  isOpen: boolean;
  isMobile: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

export function useSidebar(): UseSidebarReturn {
  // Check if we're in a browser environment
  const getIsMobile = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
  }, []);

  const [isMobile, setIsMobile] = useState<boolean>(getIsMobile);
  // Sidebar is closed by default on mobile, open on desktop
  const [isOpen, setIsOpen] = useState<boolean>(!getIsMobile());

  // Listen for viewport changes using matchMedia
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const handleChange = (e: MediaQueryListEvent) => {
      const mobile = e.matches;
      setIsMobile(mobile);

      // Auto-close sidebar when switching to mobile
      // Auto-open sidebar when switching to desktop
      setIsOpen(!mobile);
    };

    // Set initial state
    setIsMobile(mediaQuery.matches);
    setIsOpen(!mediaQuery.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    isMobile,
    toggle,
    open,
    close,
  };
}
