import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'approved' | 'review' | 'blocked' | 'neutral' | 'info' | 'sandbox';
  size?: 'sm' | 'md';
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  dot = false,
}) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  const variantClasses = {
    approved: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25',
    review: 'bg-amber-500/10 text-amber-400 border border-amber-500/25',
    blocked: 'bg-rose-500/10 text-rose-400 border border-rose-500/25',
    neutral: 'bg-slate-800 text-slate-300 border border-slate-700/60',
    info: 'bg-blue-500/10 text-blue-400 border border-blue-500/25',
    sandbox: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30',
  }[variant];

  const dotColor = {
    approved: 'bg-emerald-400',
    review: 'bg-amber-400',
    blocked: 'bg-rose-400',
    neutral: 'bg-slate-400',
    info: 'bg-blue-400',
    sandbox: 'bg-cyan-400',
  }[variant];

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${sizeClasses} ${variantClasses} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dotColor} animate-pulse`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};
