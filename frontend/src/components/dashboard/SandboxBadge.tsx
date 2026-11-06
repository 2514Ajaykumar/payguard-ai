import React from 'react';
import { ShieldCheck, Info } from 'lucide-react';

export const SandboxBadge: React.FC = () => {
  return (
    <div className="relative group inline-flex items-center">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-medium cursor-help transition-all hover:bg-cyan-950/60 hover:border-cyan-400/50">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
        </span>
        <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
        <span className="tracking-tight font-semibold">PayPal Sandbox</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/60 text-cyan-200 border border-cyan-700/50 uppercase tracking-wider">
          Simulation
        </span>
        <Info className="w-3 h-3 text-cyan-400/70 ml-0.5" />
      </div>

      {/* Tooltip on hover */}
      <div className="absolute right-0 top-full mt-2 hidden group-hover:block z-50 w-72 p-3 bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-left pointer-events-none">
        <div className="flex items-center gap-1.5 text-cyan-300 font-medium text-xs mb-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Environment: Sandbox Simulation</span>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed">
          Phase 1 uses simulated pre-transaction guardrail telemetry. Live PayPal Sandbox Orders API credentials and order captures will be activated in Phase 3.
        </p>
      </div>
    </div>
  );
};
