import React from 'react';
import { Server, RefreshCw, CheckCircle2, AlertTriangle, Clock, Cpu } from 'lucide-react';
import { BackendStatusState } from '../../types';

interface BackendStatusBannerProps {
  status: BackendStatusState;
  onRefresh: () => void;
  compact?: boolean;
}

export const BackendStatusBanner: React.FC<BackendStatusBannerProps> = ({
  status,
  onRefresh,
  compact = false,
}) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          disabled={status.isLoading}
          title="Click to re-check backend health"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 hover:border-slate-600 transition-all text-xs"
        >
          <Server className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-300">Backend API:</span>
          {status.isLoading ? (
            <span className="flex items-center gap-1 text-slate-400">
              <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
              <span>Checking...</span>
            </span>
          ) : status.isConnected ? (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Connected</span>
              {status.latencyMs !== null && (
                <span className="text-[10px] text-slate-400 ml-1">({status.latencyMs}ms)</span>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-rose-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>Offline</span>
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      status.isConnected 
        ? 'bg-slate-900/60 border-slate-800' 
        : 'bg-rose-950/20 border-rose-900/40'
    }`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${
            status.isConnected 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}>
            {status.isLoading ? (
              <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
            ) : status.isConnected ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-white">
                Express Backend Health Service
              </h4>
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                status.isConnected 
                  ? 'bg-emerald-500/20 text-emerald-300' 
                  : 'bg-rose-500/20 text-rose-300'
              }`}>
                {status.isConnected ? 'Operational' : 'Disconnected'}
              </span>
            </div>
            
            <p className="text-xs text-slate-400 mt-0.5">
              {status.isConnected && status.data
                ? `Service "${status.data.service}" v${status.data.version} in ${status.data.environment} mode`
                : status.error || 'Backend service is not reachable. Please verify the API connection.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {status.isConnected && status.data && (
            <div className="hidden md:flex items-center gap-4 text-xs text-slate-400 border-r border-slate-800 pr-4">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Uptime: {status.data.uptimeSeconds}s
              </span>
              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-slate-500" />
                Mem: {status.data.checks.memoryUsageMB} MB
              </span>
              <span className="text-cyan-400 font-mono text-[11px]">
                {status.latencyMs}ms ping
              </span>
            </div>
          )}

          <button
            onClick={onRefresh}
            disabled={status.isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${status.isLoading ? 'animate-spin' : ''}`} />
            <span>Verify API</span>
          </button>
        </div>
      </div>
    </div>
  );
};
