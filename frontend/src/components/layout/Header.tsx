import React from 'react';
import { Shield, Menu, X, Sparkles } from 'lucide-react';
import { SandboxBadge } from '../dashboard/SandboxBadge';
import { BackendStatusBanner } from '../dashboard/BackendStatusBanner';
import { BackendStatusState } from '../../types';

interface HeaderProps {
  backendStatus: BackendStatusState;
  onRefreshBackend: () => void;
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  onOpenSimulatorShortcut: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  backendStatus,
  onRefreshBackend,
  mobileMenuOpen,
  onToggleMobileMenu,
  onOpenSimulatorShortcut,
}) => {
  return (
    <header className="sticky top-0 z-30 h-16 bg-background-surface/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 flex items-center justify-between">
      {/* Brand & Left section */}
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger */}
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Toggle Navigation Menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 p-0.5 flex items-center justify-center shadow-lg shadow-cyan-900/30">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Shield className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                PayGuard <span className="text-cyan-400 font-extrabold">AI</span>
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/50 hidden sm:inline">
                PayPal Hackathon
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block tracking-wide">
              Trust Before the Transaction
            </p>
          </div>
        </div>
      </div>

      {/* Right section: Sandbox Indicator & Backend Health */}
      <div className="flex items-center gap-3">
        {/* Quick Simulator shortcut button */}
        <button
          onClick={onOpenSimulatorShortcut}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 text-xs font-medium transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Test Intent</span>
        </button>

        {/* Backend health status compact pill */}
        <BackendStatusBanner
          status={backendStatus}
          onRefresh={onRefreshBackend}
          compact
        />

        {/* Sandbox environment indicator */}
        <SandboxBadge />
      </div>
    </header>
  );
};
