import React from 'react';
import { CreditCard, ArrowUpRight } from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';

export const PassportsView: React.FC = () => {
  const passports = [
    {
      agentId: 'DevOps-Autonomous-Bot-4',
      role: 'Infrastructure Automation',
      monthlyCap: '$1,500.00',
      currentSpend: '$465.50',
      allowedCategories: ['Developer Tools', 'Cloud Hosting', 'Domain Services'],
      status: 'Active',
      tokenHash: 'pp_live_sec_9948***c9a',
    },
    {
      agentId: 'Procurement-Agent-Alpha',
      role: 'Hardware & SaaS Procurement',
      monthlyCap: '$10,000.00',
      currentSpend: '$4,850.00',
      allowedCategories: ['Office Supplies', 'Hardware', 'Software Licenses'],
      status: 'Active',
      tokenHash: 'pp_live_sec_4102***b1e',
    },
    {
      agentId: 'Marketing-Automation-Agent',
      role: 'Ad Campaign Orchestrator',
      monthlyCap: '$2,500.00',
      currentSpend: '$1,960.00',
      allowedCategories: ['Social Advertising', 'Analytics Tools'],
      status: 'Suspended (Velocity Violation)',
      tokenHash: 'pp_live_sec_7721***f39',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Agent Payment Passports
          </h2>
          <Badge variant="info">Phase 2 Architecture</Badge>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Cryptographically signed, scoped spending credentials granting autonomous agents pre-approved access to PayPal payment rails.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {passports.map((pass) => (
          <Card key={pass.agentId} className="flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <CreditCard className="w-4 h-4" />
                </div>
                <Badge
                  variant={pass.status.includes('Active') ? 'approved' : 'blocked'}
                  dot
                  size="sm"
                >
                  {pass.status}
                </Badge>
              </div>

              <h3 className="text-sm font-semibold text-white truncate" title={pass.agentId}>
                {pass.agentId}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">{pass.role}</p>

              <div className="mt-4 p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Monthly Cap:</span>
                  <span className="text-white font-mono font-medium">{pass.monthlyCap}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Current Spend:</span>
                  <span className="text-cyan-400 font-mono font-medium">{pass.currentSpend}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Key Scopes:</span>
                  <span className="text-slate-300 font-mono text-[11px] truncate max-w-[120px]">
                    {pass.tokenHash}
                  </span>
                </div>
              </div>

              <div className="mt-3">
                <span className="text-[11px] text-slate-400 block mb-1.5">Permitted Categories:</span>
                <div className="flex flex-wrap gap-1">
                  {pass.allowedCategories.map((c, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>Passport ID: #{pass.agentId.slice(-4)}</span>
              <span className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 cursor-pointer">
                View Policy <ArrowUpRight className="w-3 h-3" />
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
