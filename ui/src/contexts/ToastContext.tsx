import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ToastContainer, ToastType } from '../components/ui/Toast';

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  success: (title: string, message?: string, duration?: number) => void;
  error: (title: string, message?: string, duration?: number) => void;
  warning: (title: string, message?: string, duration?: number) => void;
  info: (title: string, message?: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const close = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((type: ToastType, title: string, message?: string, duration?: number) => {
    const id = Math.random().toString(36).substring(2, 11);
    setToasts((prev) => [...prev, { id, type, title, message, duration }]);
  }, []);

  const success = useCallback((title: string, message?: string, duration?: number) => show('success', title, message, duration), [show]);
  const error = useCallback((title: string, message?: string, duration?: number) => show('error', title, message, duration ?? 6000), [show]);
  const warning = useCallback((title: string, message?: string, duration?: number) => show('warning', title, message, duration), [show]);
  const info = useCallback((title: string, message?: string, duration?: number) => show('info', title, message, duration), [show]);

  return (
    <ToastContext.Provider value={{ success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onClose={close} />
    </ToastContext.Provider>
  );
}
