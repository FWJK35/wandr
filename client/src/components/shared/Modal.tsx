import { ReactNode, useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
}

export default function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    full: 'max-w-full mx-4',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div
        className={`relative w-full ${sizeClasses[size]} bg-dark-200 rounded-t-2xl sm:rounded-2xl border border-white/10 shadow-xl max-h-[90vh] overflow-hidden flex flex-col animate-slide-up`}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <h2 className="font-display font-semibold text-lg">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors"
            >
              <span className="text-xl text-gray-400">×</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
