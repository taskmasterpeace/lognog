import React, { useState, useRef, cloneElement } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  arrow,
  FloatingArrow,
} from '@floating-ui/react';
import type { Placement } from '@floating-ui/react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: Placement;
  delay?: number;
  maxWidth?: number;
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 200,
  maxWidth = 300,
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const arrowRef = useRef(null);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({
        fallbackAxisSideDirection: 'start',
        padding: 5,
      }),
      shift({ padding: 5 }),
      arrow({
        element: arrowRef,
      }),
    ],
  });

  const hover = useHover(context, {
    move: false,
    delay: { open: delay, close: 0 },
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  return (
    <>
      {cloneElement(
        children,
        getReferenceProps({ ref: refs.setReference, ...children.props })
      )}
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{
              ...floatingStyles,
              maxWidth: `${maxWidth}px`,
              zIndex: 9999,
            }}
            {...getFloatingProps()}
            className="tooltip-floating"
          >
            <div className="bg-gray-900 dark:bg-gray-800 text-white dark:text-gray-100 px-3 py-2 rounded-lg shadow-xl border border-gray-700 dark:border-gray-600 text-sm leading-relaxed animate-fade-in">
              {content}
              <FloatingArrow
                ref={arrowRef}
                context={context}
                className="fill-gray-900 dark:fill-gray-800"
              />
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

interface TooltipCodeProps {
  content: React.ReactNode;
  code?: string;
  children: React.ReactElement;
  placement?: Placement;
}

export function TooltipWithCode({
  content,
  code,
  children,
  placement = 'top',
}: TooltipCodeProps) {
  return (
    <Tooltip
      content={
        <div className="space-y-2">
          <div>{content}</div>
          {code && (
            <pre className="bg-gray-950 dark:bg-gray-900 p-2 rounded text-xs font-mono overflow-x-auto border border-gray-700">
              <code>{code}</code>
            </pre>
          )}
        </div>
      }
      placement={placement}
      maxWidth={400}
    >
      {children}
    </Tooltip>
  );
}
