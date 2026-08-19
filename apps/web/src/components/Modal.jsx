import React from 'react';

export default function Modal({
  isOpen = true,
  onClose,
  children,
  className = 'max-w-2xl p-8',
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div
        className={`backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
