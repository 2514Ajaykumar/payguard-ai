import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: LucideIcon;
  variant: 'default' | 'approved' | 'review' | 'blocked';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  change,
  changeType = 'neutral',
  icon: Icon,
  variant,
}) => {
  const styles = {
    default: {
      border: 'border-slate-800 hover:border-slate-700',
      iconBg: 'bg-slate-800/80 text-slate-300',
      accent: 'text-slate-200',
    },
    approved: {
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      accent: 'text-emerald-400',
    },
    review: {
      border: 'border-amber-500/20 hover:border-amber-500/40',
      iconBg: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
      accent: 'text-amber-400',
    },
    blocked: {
      border: 'border-rose-500/20 hover:border-rose-500/40',
      iconBg: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
      accent: 'text-rose-400',
    },
  }[variant];

  const changeColor = {
    positive: 'text-emerald-400',
    negative: 'text-rose-400',
    neutral: 'text-slate-400',
  }[changeType];

  return (
    <div
      className={`p-5 rounded-xl bg-background-surface/80 border ${styles.border} transition-all duration-200 shadow-md shadow-black/20`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
          {title}
        </span>
        <div className={`p-2 rounded-lg ${styles.iconBg}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold text-white tracking-tight">
          {value}
        </div>
        {change && (
          <span className={`text-xs font-semibold ${changeColor}`}>
            {change}
          </span>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-1.5 flex items-center justify-between">
        <span>{subtitle}</span>
      </p>
    </div>
  );
};
