import React from 'react';
import { 
  LayoutDashboard, 
  Bot, 
  ShieldCheck, 
  ArrowLeftRight, 
  CreditCard,
  Lock
} from 'lucide-react';
import { NavigationTab } from '../../types';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  mobileMenuOpen,
  onCloseMobileMenu,
}) => {
  const navItems = [
    {
      id: 'overview' as NavigationTab,
      label: 'Overview',
      icon: LayoutDashboard,
      badge: 'Live',
      badgeColor: 'bg-emerald-950 text-emerald-400 border border-emerald-800/40',
      description: 'System health & guardrail metrics',
    },
    {
      id: 'ai_agent' as NavigationTab,
      label: 'AI Agent Simulator',
      icon: Bot,
      badge: 'Phase 1',
      badgeColor: 'bg-cyan-950 text-cyan-400 border border-cyan-800/40',
      description: 'Pre-transaction intent evaluation',
    },
    {
      id: 'policies' as NavigationTab,
      label: 'Policies & Rules',
      icon: ShieldCheck,
      badge: '4 Active',
      badgeColor: 'bg-slate-800 text-slate-300 border border-slate-700/60',
      description: 'Spend caps, whitelists, velocities',
    },
    {
      id: 'transactions' as NavigationTab,
      label: 'Transactions Stream',
      icon: ArrowLeftRight,
      badge: 'Simulated',
      badgeColor: 'bg-amber-950 text-amber-400 border border-amber-800/40',
      description: 'Real-time telemetry stream',
    },
    {
      id: 'payment_passports' as NavigationTab,
      label: 'Payment Passports',
      icon: CreditCard,
      badge: 'Roadmap',
      badgeColor: 'bg-indigo-950 text-indigo-300 border border-indigo-800/40',
      description: 'Agent tokenized credentials',
    },
    {
      id: 'paypal_orders' as NavigationTab,
      label: 'PayPal Sandbox Orders',
      icon: CreditCard,
      badge: 'Orders v2',
      badgeColor: 'bg-blue-950 text-cyan-300 border border-blue-800/40',
      description: 'Sandbox capture audit trail',
    },
  ];

  const handleNavClick = (tab: NavigationTab) => {
    onSelectTab(tab);
    onCloseMobileMenu();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={onCloseMobileMenu}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-16 bottom-0 left-0 z-40 w-64 bg-background-surface border-r border-slate-800/80 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Navigation list */}
        <div className="p-4 space-y-6 overflow-y-auto">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
              Platform Navigation
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all group ${
                      isActive
                        ? 'bg-gradient-to-r from-cyan-950/80 to-blue-950/50 text-cyan-300 border border-cyan-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive
                            ? 'text-cyan-400'
                            : 'text-slate-400 group-hover:text-slate-200'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {item.badge && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${item.badgeColor}`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Quick Architecture Status Box */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Security Guardrail Engine</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              PayGuard enforces strict pre-authorization verification before AI agents can interact with PayPal payment pipelines.
            </p>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>Foundation: Phase 1</span>
              <span className="text-emerald-400">Ready</span>
            </div>
          </div>
        </div>

        {/* Footer info in sidebar */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/50 text-[11px] text-slate-400">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>PayPal AI Hackathon</span>
            </span>
            <span className="font-mono text-slate-500">v1.0.0</span>
          </div>
        </div>
      </aside>
    </>
  );
};
