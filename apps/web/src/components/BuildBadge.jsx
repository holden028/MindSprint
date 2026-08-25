import React from 'react';

const REPO = 'https://github.com/holden028/MindSprint';

export default function BuildBadge() {
  const sha = import.meta.env.VITE_BUILD_SHA || 'dev';
  const href = sha === 'dev' ? REPO : `${REPO}/commit/${sha}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Deployed from GitHub commit ${sha}`}
      className="fixed bottom-20 md:bottom-3 right-3 z-30 rounded-md bg-black/35 px-2 py-1 font-mono text-[10px] text-white/40 backdrop-blur-sm transition-colors hover:text-white/70"
    >
      build {sha}
    </a>
  );
}
