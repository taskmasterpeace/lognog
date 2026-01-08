import { useEffect, useCallback, useRef } from 'react';

type KeyHandler = (event: KeyboardEvent) => void;

interface HotkeyOptions {
  enabled?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  enableOnFormTags?: boolean;
}

const defaultOptions: HotkeyOptions = {
  enabled: true,
  preventDefault: true,
  stopPropagation: false,
  enableOnFormTags: false,
};

/**
 * Hook for handling keyboard shortcuts
 *
 * @param keys - Key combination (e.g., 'ctrl+k', 'escape', 'ctrl+shift+p')
 * @param handler - Function to call when the key combination is pressed
 * @param options - Additional options
 */
export function useHotkey(
  keys: string | string[],
  handler: KeyHandler,
  options: HotkeyOptions = {}
) {
  const { enabled, preventDefault, stopPropagation, enableOnFormTags } = {
    ...defaultOptions,
    ...options,
  };

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const parseKey = useCallback((keyString: string) => {
    const parts = keyString.toLowerCase().split('+');
    return {
      key: parts[parts.length - 1],
      ctrl: parts.includes('ctrl') || parts.includes('control'),
      shift: parts.includes('shift'),
      alt: parts.includes('alt'),
      meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const keyArray = Array.isArray(keys) ? keys : [keys];
    const parsedKeys = keyArray.map(parseKey);

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger on form elements unless explicitly enabled
      if (!enableOnFormTags) {
        const target = event.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        if (['input', 'textarea', 'select'].includes(tagName)) {
          // Allow escape key on form elements
          if (event.key.toLowerCase() !== 'escape') {
            return;
          }
        }
      }

      const pressedKey = event.key.toLowerCase();
      const isCtrl = event.ctrlKey || event.metaKey; // Treat Cmd as Ctrl on Mac
      const isShift = event.shiftKey;
      const isAlt = event.altKey;

      for (const parsed of parsedKeys) {
        const keyMatches = pressedKey === parsed.key ||
          (parsed.key === 'escape' && pressedKey === 'escape') ||
          (parsed.key === 'enter' && pressedKey === 'enter') ||
          (parsed.key === 'backspace' && pressedKey === 'backspace');

        if (
          keyMatches &&
          isCtrl === parsed.ctrl &&
          isShift === parsed.shift &&
          isAlt === parsed.alt
        ) {
          if (preventDefault) event.preventDefault();
          if (stopPropagation) event.stopPropagation();
          handlerRef.current(event);
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [keys, enabled, preventDefault, stopPropagation, enableOnFormTags, parseKey]);
}

/**
 * Hook for multiple hotkeys at once
 */
export function useHotkeys(
  keyMap: Record<string, KeyHandler>,
  options: HotkeyOptions = {}
) {
  useEffect(() => {
    if (options.enabled === false) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger on form elements unless explicitly enabled
      if (!options.enableOnFormTags) {
        const target = event.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        if (['input', 'textarea', 'select'].includes(tagName)) {
          if (event.key.toLowerCase() !== 'escape') {
            return;
          }
        }
      }

      const pressedKey = event.key.toLowerCase();
      const isCtrl = event.ctrlKey || event.metaKey;
      const isShift = event.shiftKey;
      const isAlt = event.altKey;

      for (const [keyString, handler] of Object.entries(keyMap)) {
        const parts = keyString.toLowerCase().split('+');
        const key = parts[parts.length - 1];
        const ctrl = parts.includes('ctrl') || parts.includes('control');
        const shift = parts.includes('shift');
        const alt = parts.includes('alt');

        if (
          pressedKey === key &&
          isCtrl === ctrl &&
          isShift === shift &&
          isAlt === alt
        ) {
          if (options.preventDefault !== false) event.preventDefault();
          if (options.stopPropagation) event.stopPropagation();
          handler(event);
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [keyMap, options]);
}

export default useHotkey;
