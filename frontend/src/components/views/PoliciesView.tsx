import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Clock, 
  AlertTriangle, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  Server, 
  Lock 
} from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { fetchPolicies, updatePolicies, resetPolicies } from '../../services/api';
import { SpendingPolicy } from '../../types';

export const PoliciesView: React.FC = () => {
  const [policy, setPolicy] = useState<SpendingPolicy | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Editable fields
  const [autoApprovalCap, setAutoApprovalCap] = useState<string>('100');
  const [reviewCap, setReviewCap] = useState<string>('500');
  const [currencies, setCurrencies] = useState<string>('USD, EUR, GBP, CAD, AUD');

  const loadPolicies = async () => {
    setStatusMessage(null);
    const result = await fetchPolicies();

    if (result.success && result.data) {
      setPolicy(result.data);
      setAutoApprovalCap(result.data.autoApprovalMaxAmount.toString());
      setReviewCap(result.data.reviewThresholdMaxAmount.toString());
      setCurrencies(result.data.supportedCurrencies.join(', '));
    } else {
      setStatusMessage({ type: 'error', text: result.error || 'Failed to load policy rules from backend.' });
    }
  };

  useEffect(() => {
    loadPolicies();
  }, []);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);

    const parsedAuto = parseFloat(autoApprovalCap);
    const parsedReview = parseFloat(reviewCap);
    const parsedCurrencies = currencies.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);

    const result = await updatePolicies({
      autoApprovalMaxAmount: parsedAuto,
      reviewThresholdMaxAmount: parsedReview,
      supportedCurrencies: parsedCurrencies,
    });

    setIsSaving(false);

    if (result.success && result.data) {
      setPolicy(result.data);
      setStatusMessage({ type: 'success', text: 'Backend spending policies updated and enforced across all subsequent requests!' });
    } else {
      setStatusMessage({ type: 'error', text: result.error || 'Failed to update policy parameters.' });
    }
  };

  const handleResetPolicy = async () => {
    setIsSaving(true);
    setStatusMessage(null);

    const result = await resetPolicies();
    setIsSaving(false);

    if (result.success && result.data) {
      setPolicy(result.data);
      setAutoApprovalCap(result.data.autoApprovalMaxAmount.toString());
      setReviewCap(result.data.reviewThresholdMaxAmount.toString());
      setCurrencies(result.data.supportedCurrencies.join(', '));
      setStatusMessage({ type: 'success', text: 'Policies reset to PayGuard defaults ($100 auto-approval, $500 review threshold).' });
    } else {
      setStatusMessage({ type: 'error', text: result.error || 'Failed to reset policies.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Pre-Transaction Policy Service
            </h2>
            <Badge variant="approved">
              <Server className="w-3 h-3 mr-1 inline" />
              Active Engine
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic spending rules, currency bounds, and merchant safety filters enforced by <code>/api/policies</code>.
          </p>
        </div>

        <button
          onClick={handleResetPolicy}
          disabled={isSaving}
          className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
          <span>Reset Defaults</span>
        </button>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300'
              : 'bg-rose-950/40 border border-rose-800 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Interactive Policy Configuration Form */}
      <Card title="Configurable Policy Thresholds" subtitle="Update live engine limits via PUT /api/policies">
        <form onSubmit={handleSavePolicy} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Auto-Approval Max Cap (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-slate-500">$</span>
                <input
                  type="number"
                  step="any"
                  value={autoApprovalCap}
                  onChange={(e) => setAutoApprovalCap(e.target.value)}
                  className="w-full pl-6 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  required
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Purchases up to this amount pass without human review.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Review Threshold Max Cap (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-slate-500">$</span>
                <input
                  type="number"
                  step="any"
                  value={reviewCap}
                  onChange={(e) => setReviewCap(e.target.value)}
                  className="w-full pl-6 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  required
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Purchases between auto-cap and this threshold require review; above this requires explicit approval.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Supported Currencies (Comma Separated)
              </label>
              <input
                type="text"
                value={currencies}
                onChange={(e) => setCurrencies(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                required
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Currencies outside this allowlist are rejected safely.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-all flex items-center gap-2 shadow-md shadow-cyan-900/20 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Updating Engine...' : 'Save & Enforce Policies'}</span>
            </button>
          </div>
        </form>
      </Card>

      {/* Active Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="space-y-3">
          <div className="flex items-center gap-2 text-white font-semibold text-xs">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>Tier 1: Autonomous Auto-Approval</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Requests with amounts <strong>&le; ${policy?.autoApprovalMaxAmount ?? 100}</strong> are granted immediate pre-authorization, provided no budget or category policy is breached.
          </p>
          <div className="pt-2 border-t border-slate-800 flex justify-between text-xs font-mono">
            <span className="text-slate-400">Current Threshold:</span>
            <span className="text-emerald-400 font-bold">&le; ${policy?.autoApprovalMaxAmount ?? 100}</span>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2 text-white font-semibold text-xs">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Tier 2 & 3: Human Review & Explicit Approval</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Requests between <strong>${policy?.autoApprovalMaxAmount ?? 100}</strong> and <strong>${policy?.reviewThresholdMaxAmount ?? 500}</strong> trigger human review. Requests <strong>&gt; ${policy?.reviewThresholdMaxAmount ?? 500}</strong> require explicit supervisor authorization.
          </p>
          <div className="pt-2 border-t border-slate-800 flex justify-between text-xs font-mono">
            <span className="text-slate-400">High-Value Cutoff:</span>
            <span className="text-amber-400 font-bold">&gt; ${policy?.reviewThresholdMaxAmount ?? 500}</span>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2 text-white font-semibold text-xs">
            <Lock className="w-4 h-4 text-cyan-400" />
            <span>User Stated Budget Enforcer</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            When a purchase intent includes an explicit <code>userBudgetLimit</code>, requests exceeding that budget are prohibited from automatic approval, preventing autonomous budget runaway.
          </p>
          <div className="pt-2 border-t border-slate-800 flex justify-between text-xs font-mono">
            <span className="text-slate-400">Enforcement:</span>
            <span className="text-cyan-400 font-bold">Strict Gate</span>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2 text-white font-semibold text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Prohibited Categories & Untrusted TLDs</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Automatically intercepts and permanently blocks attempts targeting restricted keywords (vouchers, crypto, gift cards) or untrusted top-level domains (.xyz, .top, .biz).
          </p>
          <div className="pt-2 border-t border-slate-800 flex justify-between text-xs font-mono">
            <span className="text-slate-400">Outcome:</span>
            <span className="text-rose-400 font-bold">Hard Block</span>
          </div>
        </Card>
      </div>
    </div>
  );
};
