import { useState, useEffect, useRef, createContext, useContext, useCallback, ReactNode } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  icon?: ReactNode;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = () => {
    confirmState?.resolve(true);
    setConfirmState(null);
  };

  const handleCancel = () => {
    confirmState?.resolve(false);
    setConfirmState(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {confirmState && (
        <ConfirmDialog
          {...confirmState}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
}

interface ConfirmDialogProps extends ConfirmOptions {
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const variantStyles = {
    danger: {
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-600 dark:text-red-400',
      button: 'bg-red-600 hover:bg-red-700 text-white',
      defaultIcon: <Trash2 className="w-6 h-6" />,
    },
    warning: {
      iconBg: 'bg-honey-100 dark:bg-honey-900/30',
      iconColor: 'text-honey-600 dark:text-honey-400',
      button: 'bg-honey-500 hover:bg-honey-400 text-nog-900',
      defaultIcon: <AlertTriangle className="w-6 h-6" />,
    },
    default: {
      iconBg: 'bg-honey-100 dark:bg-honey-900/30',
      iconColor: 'text-honey-600 dark:text-honey-400',
      button: 'bg-honey-500 hover:bg-honey-400 text-nog-900',
      defaultIcon: <AlertTriangle className="w-6 h-6" />,
    },
  };

  const styles = variantStyles[variant];
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the cancel button on mount and close on Escape
  useEffect(() => {
    cancelRef.current?.focus();
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

  return (
    <div
      className="modal-overlay p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-nog-800 rounded-xl shadow-xl max-w-md w-full animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-full ${styles.iconBg} ${styles.iconColor}`}>
              {icon || styles.defaultIcon}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-nog-900 dark:text-nog-100">
                {title}
              </h3>
              <p className="mt-2 text-sm text-nog-600 dark:text-nog-400">
                {message}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="p-1 hover:bg-nog-100 dark:hover:bg-nog-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-nog-400" />
            </button>
          </div>
        </div>
        <div className="flex gap-3 p-4 border-t border-nog-200 dark:border-nog-700">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-nog-700 dark:text-nog-300 bg-nog-100 dark:bg-nog-700 hover:bg-nog-200 dark:hover:bg-nog-600 rounded-lg font-medium transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${styles.button}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
