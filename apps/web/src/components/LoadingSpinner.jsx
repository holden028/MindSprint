import React from 'react';

export default function LoadingSpinner({ embedded = false }) {
  const spinner = (
    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white"></div>
  );

  if (embedded) {
    return (
      <div className="flex items-center justify-center py-24">
        {spinner}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {spinner}
    </div>
  );
}
