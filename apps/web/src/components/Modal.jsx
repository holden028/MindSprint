import React, { useEffect } from 'react';

/**
 * Mobile-first modal shell:
 * - safe-area insets (notch / home indicator)
 * - scrolls inside the panel
 * - leaves room for the bottom nav on phones
 * - locks background scroll while open
 */
export default function Modal({
  isOpen = true,
  onClose,
  children,
  className = 'max-w-2xl',
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm
                 pt-[env(safe-area-inset-top)]
                 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-[env(safe-area-inset-bottom)]
                 px-0 sm:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`
          backdrop-blur-xl bg-gray-950/95 sm:bg-white/10 border border-white/20 shadow-2xl relative
          w-full sm:w-full
          rounded-t-2xl sm:rounded-2xl
          max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-5.5rem-env(safe-area-inset-bottom)))]
          sm:max-h-[min(90dvh,calc(100dvh-2rem))]
          overflow-y-auto overscroll-contain
          p-4 sm:p-6
          ${className}
        `}
        style={{ WebkitOverflowScrolling: 'touch' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
