import React from 'react';

export default function ScalePicker({
  label,
  icon: Icon,
  value,
  onChange,
  max = 5,
  gradient = 'from-green-500 to-teal-500',
  lowLabel,
  highLabel,
}) {
  const levels = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <div className="mb-6">
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
        {Icon && <Icon size={20} />}
        {label} ({value}/{max})
      </h3>
      <div className="flex items-center gap-2">
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={`flex-1 h-12 rounded-lg transition-all ${
              level <= value
                ? `bg-gradient-to-r ${gradient}`
                : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            <span className="text-white text-sm font-medium">{level}</span>
          </button>
        ))}
      </div>
      {(lowLabel || highLabel) && (
        <div className="flex justify-between text-xs text-white/50 mt-2">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  );
}
