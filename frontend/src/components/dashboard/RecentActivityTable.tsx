import React, { useState } from 'react';
import { 
  Search, 
  X, 
  FileText, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Zap
} from 'lucide-react';
import { AuthorizationDecision, DecisionStatus } from '../../types';
import { Badge } from '../common/Badge';
import { submitReview } from '../../services/api';

interface RecentActivityTableProps {
  decisions: AuthorizationDecision[];
  onDecisionUpdated?: (updated: AuthorizationDecision) => void;
  onSelectDecisionForCheckout?: (decision: AuthorizationDecision) => void;
  isEmptyState?: boolean;
}

export const RecentActivityTable: React.FC<RecentActivityTableProps> = ({
  decisions,
  onDecisionUpdated,
  onSelectDecisionForCheckout,
  isEmptyState = false,
}) => {
  const [filter, setFilter] = useState<'ALL' | DecisionStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDecision, setSelectedDecision] = useState<AuthorizationDecision | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const filteredDecisions = decisions.filter((d) => {
    const matchesFilter = filter === 'ALL' || d.status === filter;
    const query = searchQuery.toLowerCase();
    const intent = d.purchaseIntent;
    const matchesSearch =
      d.decisionId.toLowerCase().includes(query) ||
      intent.merchantName.toLowerCase().includes(query) ||
      intent.agentId.toLowerCase().includes(query) ||
      (intent.merchantDomain && intent.merchantDomain.toLowerCase().includes(query)) ||
      d.reasonCodes.some((code) => code.toLowerCase().includes(query));
    return matchesFilter && matchesSearch;
  });

  const getStatusBadge = (status: DecisionStatus) => {
    switch (status) {
      case 'APPROVED':
        return <Badge variant="approved" dot>Approved</Badge>;
      case 'REVIEW_REQUIRED':
        return <Badge variant="review" dot>Review Required</Badge>;
      case 'BLOCKED':
        return <Badge variant="blocked" dot>Blocked</Badge>;
    }
  };

  const handleReviewAction = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedDecision) return;
    setIsSubmittingReview(true);
    setReviewError(null);

    const result = await submitReview(selectedDecision.decisionId, action, reviewNotes);

    setIsSubmittingReview(false);

    if (result.success && result.data) {
      setSelectedDecision(result.data);
      if (onDecisionUpdated) {
        onDecisionUpdated(result.data);
      }
      setReviewNotes('');
    } else {
      setReviewError(result.error || 'Failed to submit supervisor review.');
    }
  };

  if (isEmptyState || decisions.length === 0) {
    return (
      <div className="rounded-xl bg-background-surface border border-slate-800 p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-white">No Authorization Decisions Recorded</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
          All decisions evaluated by the backend engine will be archived here. Submit an intent in the simulator above to generate your first audit record.
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          <span>Awaiting authorization requests...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-background-surface border border-slate-800 shadow-xl overflow-hidden">
      {/* Header bar */}
      <div className="px-5 py-4 border-b border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Authorization Decision Audit Trail
            </h3>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 border border-blue-800/60">
              AUDITABLE &bull; IN-MEMORY
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable pre-transaction evaluations recorded by backend engine (Phase 2 temporary repository)
          </p>
        </div>

        {/* Filters and search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Pills */}
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filter === 'ALL'
                  ? 'bg-slate-800 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({decisions.length})
            </button>
            <button
              onClick={() => setFilter('APPROVED')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filter === 'APPROVED'
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 font-medium'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => setFilter('REVIEW_REQUIRED')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filter === 'REVIEW_REQUIRED'
                  ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40 font-medium'
                  : 'text-slate-400 hover:text-amber-400'
              }`}
            >
              Review Required
            </button>
            <button
              onClick={() => setFilter('BLOCKED')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filter === 'BLOCKED'
                  ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40 font-medium'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              Blocked
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, merchant, agent..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 w-44 sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-3 px-4">Decision ID / Agent</th>
              <th className="py-3 px-4">Merchant & Domain</th>
              <th className="py-3 px-4 text-right">Amount</th>
              <th className="py-3 px-4">Authorization Status</th>
              <th className="py-3 px-4">PayPal Gate</th>
              <th className="py-3 px-4">Primary Reason</th>
              <th className="py-3 px-4 text-right">Evaluated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-200">
            {filteredDecisions.map((d) => (
              <tr
                key={d.decisionId}
                onClick={() => setSelectedDecision(d)}
                className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
              >
                <td className="py-3.5 px-4 font-mono">
                  <div className="font-semibold text-white group-hover:text-cyan-400 transition-colors">
                    {d.decisionId}
                  </div>
                  <div className="text-[11px] text-slate-400 font-sans truncate max-w-[150px]">
                    {d.purchaseIntent.agentId}
                  </div>
                </td>

                <td className="py-3.5 px-4">
                  <div className="font-medium text-white">{d.purchaseIntent.merchantName}</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {d.purchaseIntent.merchantDomain || 'domain unstated'}
                  </div>
                </td>

                <td className="py-3.5 px-4 text-right font-mono font-semibold text-white">
                  ${d.purchaseIntent.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {d.purchaseIntent.currency}
                </td>

                <td className="py-3.5 px-4">{getStatusBadge(d.status)}</td>

                <td className="py-3.5 px-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                      d.canProceedToPayment
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                        : 'bg-rose-950 text-rose-300 border border-rose-800/60'
                    }`}
                  >
                    {d.canProceedToPayment ? 'CAN PROCEED' : 'HALTED'}
                  </span>
                </td>

                <td className="py-3.5 px-4 text-slate-300">
                  <span className="truncate max-w-[170px] inline-block font-mono text-[11px]" title={d.reasonCodes.join(', ')}>
                    {d.reasonCodes[0] || 'COMPLIANT'}
                  </span>
                </td>

                <td className="py-3.5 px-4 text-right text-slate-400 font-mono text-[11px]">
                  {new Date(d.evaluatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="px-5 py-3 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between text-xs text-slate-400">
        <div>
          Showing {filteredDecisions.length} of {decisions.length} authoritative decisions
        </div>
        <div className="text-[11px]">
          Click any row to inspect policy checks or take supervisor action
        </div>
      </div>

      {/* Decision Detail & Review Modal */}
      {selectedDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl rounded-xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-white">
                  Authorization Decision &bull; {selectedDecision.decisionId}
                </h4>
              </div>
              <button
                onClick={() => setSelectedDecision(null)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              {/* Intent Info Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[11px]">Requesting Agent:</span>
                  <span className="text-white font-mono font-medium">{selectedDecision.purchaseIntent.agentId}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Merchant:</span>
                  <span className="text-white font-medium">{selectedDecision.purchaseIntent.merchantName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Amount:</span>
                  <span className="text-white font-mono font-bold text-sm">
                    ${selectedDecision.purchaseIntent.amount.toFixed(2)} {selectedDecision.purchaseIntent.currency}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Status:</span>
                  <div className="mt-0.5">{getStatusBadge(selectedDecision.status)}</div>
                </div>
              </div>

              {/* Payment Gate Notification */}
              <div
                className={`p-3 rounded-lg border flex items-center justify-between ${
                  selectedDecision.canProceedToPayment
                    ? 'bg-emerald-950/20 border-emerald-900/60 text-emerald-300'
                    : 'bg-rose-950/20 border-rose-900/60 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {selectedDecision.canProceedToPayment ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                  )}
                  <span className="font-semibold text-xs">
                    {selectedDecision.canProceedToPayment
                      ? 'Decision Gate: Permitted to Proceed to PayPal Orders Sandbox'
                      : 'Decision Gate: Blocked from Payment Execution'}
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase font-bold">
                  canProceedToPayment = {String(selectedDecision.canProceedToPayment)}
                </span>
              </div>

              {/* Resume in Smart Flow action banner for approved decisions */}
              {selectedDecision.status === 'APPROVED' && selectedDecision.canProceedToPayment && onSelectDecisionForCheckout && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-emerald-950/40">
                  <div className="space-y-0.5">
                    <span className="font-bold text-emerald-300 text-xs flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Ready for PayPal Sandbox Checkout</span>
                    </span>
                    <p className="text-[11px] text-emerald-200/70 leading-relaxed">
                      This purchase is verified and approved. Load it directly into the Guided Smart Flow to execute checkout.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onSelectDecisionForCheckout(selectedDecision);
                      setSelectedDecision(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-900/40 flex-shrink-0"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Resume in Smart Flow</span>
                  </button>
                </div>
              )}

              {/* Policy Explanation */}
              <div>
                <span className="text-slate-400 block text-[11px] mb-1 font-semibold">
                  Authoritative Policy Explanation:
                </span>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 leading-relaxed">
                  {selectedDecision.explanation}
                </div>
              </div>

              {/* Policy Checks Detail */}
              <div>
                <span className="text-slate-400 block text-[11px] mb-1.5 font-semibold">
                  Policy Checks Evaluated ({selectedDecision.policyChecks.length}):
                </span>
                <div className="space-y-1.5">
                  {selectedDecision.policyChecks.map((check, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded bg-slate-950 border border-slate-800/80 flex items-start gap-2.5"
                    >
                      {check.status === 'PASSED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />}
                      {check.status === 'WARNING' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />}
                      {check.status === 'FAILED' && <XCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" />}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-white text-[11px]">
                            {check.checkName}
                          </span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase ${
                            check.status === 'PASSED' ? 'text-emerald-400 bg-emerald-950/40' :
                            check.status === 'WARNING' ? 'text-amber-400 bg-amber-950/40' :
                            'text-rose-400 bg-rose-950/40'
                          }`}>
                            {check.status}
                          </span>
                        </div>
                        <p className="text-slate-400 text-[11px] mt-0.5">{check.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* If reviewed, show audit trail metadata */}
              {selectedDecision.reviewMetadata && (
                <div className="p-3 rounded-lg bg-slate-950 border border-cyan-800/40 text-cyan-200 space-y-1">
                  <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Supervisor Review Recorded</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Reviewed by <strong>{selectedDecision.reviewMetadata.reviewedBy}</strong> on{' '}
                    {new Date(selectedDecision.reviewMetadata.reviewedAt).toLocaleString()}.
                  </p>
                  {selectedDecision.reviewMetadata.reviewNotes && (
                    <p className="text-[11px] text-slate-400 italic">
                      Notes: "{selectedDecision.reviewMetadata.reviewNotes}"
                    </p>
                  )}
                </div>
              )}

              {/* Review Action Bar for REVIEW_REQUIRED decisions */}
              {selectedDecision.status === 'REVIEW_REQUIRED' && !selectedDecision.reviewMetadata && (
                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-3">
                  <div className="flex items-center gap-1.5 text-amber-300 font-semibold text-xs">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Supervisor Confirmation Required</span>
                  </div>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    This request exceeded autonomous policy limits and is suspended. As a human supervisor, confirm or reject this purchase:
                  </p>

                  <input
                    type="text"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Optional review justification / reference ticket..."
                    className="w-full px-3 py-1.5 text-xs rounded bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />

                  {reviewError && (
                    <div className="text-rose-400 text-[11px]">{reviewError}</div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleReviewAction('APPROVE')}
                      disabled={isSubmittingReview}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{isSubmittingReview ? 'Updating...' : 'Manually Approve Payment'}</span>
                    </button>

                    <button
                      onClick={() => handleReviewAction('REJECT')}
                      disabled={isSubmittingReview}
                      className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-medium text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span>{isSubmittingReview ? 'Updating...' : 'Decline & Block'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <div>
                {selectedDecision.status === 'APPROVED' && selectedDecision.canProceedToPayment && onSelectDecisionForCheckout && (
                  <button
                    onClick={() => {
                      onSelectDecisionForCheckout(selectedDecision);
                      setSelectedDecision(null);
                    }}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Resume in Smart Flow</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedDecision(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
