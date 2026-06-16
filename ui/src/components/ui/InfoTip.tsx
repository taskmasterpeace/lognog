import React from 'react';
import { Tooltip, TooltipWithCode } from './Tooltip';
import type { Placement } from '@floating-ui/react';

interface InfoTipProps {
  content: React.ReactNode;
  code?: string;
  placement?: Placement;
  className?: string;
}

export function InfoTip({ content, code, placement = 'top', className = '' }: InfoTipProps) {
  const TooltipComponent = code ? TooltipWithCode : Tooltip;

  return (
    <TooltipComponent content={content} code={code} placement={placement}>
      <button
        type="button"
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-nog-600 dark:bg-nog-500 text-white text-xs font-bold hover:bg-nog-500 dark:hover:bg-nog-400 transition-colors cursor-help ${className}`}
        aria-label="More information"
      >
        ?
      </button>
    </TooltipComponent>
  );
}

interface InfoIconProps {
  content: React.ReactNode;
  code?: string;
  placement?: Placement;
  className?: string;
}

export function InfoIcon({ content, code, placement = 'top', className = '' }: InfoIconProps) {
  const TooltipComponent = code ? TooltipWithCode : Tooltip;

  return (
    <TooltipComponent content={content} code={code} placement={placement}>
      <span
        className={`inline-flex items-center justify-center cursor-help text-nog-500 dark:text-nog-400 hover:text-nog-700 dark:hover:text-nog-300 transition-colors ${className}`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </span>
    </TooltipComponent>
  );
}
