import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { MetricsGrid } from './components/dashboard/MetricsGrid';
import { AIRequestEntry } from './components/dashboard/AIRequestEntry';
import { RecentActivityTable } from './components/dashboard/RecentActivityTable';
import { BackendStatusBanner } from './components/dashboard/BackendStatusBanner';
import { PoliciesView } from './components/views/PoliciesView';
import { PassportsView } from './components/views/PassportsView';
import { PayPalOrdersView } from './components/views/PayPalOrdersView';
import { PaymentReturnView } from './components/views/PaymentReturnView';
import { checkBackendHealth, fetchDecisions } from './services/api';
import { 
  NavigationTab, 
  AuthorizationDecision, 
  DashboardMetrics, 
  BackendStatusState 
} from './types';
import { Info } from 'lucide-react';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isEmptyStateView, setIsEmptyStateView] = useState(false);

  // PayPal redirect return mode: success | cancel | null
  const [returnMode, setReturnMode] = useState<'success' | 'cancel' | null>(() => {
    const path = window.location.pathname;
    const search = window.location.search;
    if (path.includes('/payment/success') || (search.includes('token=') && !path.includes('/payment/cancel'))) {
      return 'success';
    }
    if (path.includes('/payment/cancel')) {
      return 'cancel';
    }
    return null;
  });

  // Authoritative decisions state
  const [decisions, setDecisions] = useState<AuthorizationDecision[]>([]);
  const [lastReviewedDecisionId, setLastReviewedDecisionId] = useState<string | null>(null);
  const [resumedDecision, setResumedDecision] = useState<AuthorizationDecision | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    evaluatedCount: 0,
    approvedCount: 0,
    approvalRate: 0,
    blockedCount: 0,
    blockedRate: 0,
    pendingCount: 0,
    totalSimulatedVolume: 0,
  });

  // Backend API status state
  const [backendStatus, setBackendStatus] = useState<BackendStatusState>({
    isConnected: false,
    isLoading: true,
    error: null,
    data: null,
    latencyMs: null,
    lastChecked: null,
  });

  const requestEntryRef = useRef<HTMLDivElement>(null);

  // Recompute summary metrics from decisions list
  const computeMetrics = (records: AuthorizationDecision[]): DashboardMetrics => {
    const total = records.length;
    if (total === 0) {
      return {
        evaluatedCount: 0,
        approvedCount: 0,
        approvalRate: 0,
        blockedCount: 0,
        blockedRate: 0,
        pendingCount: 0,
        totalSimulatedVolume: 0,
      };
    }

    const approved = records.filter((r) => r.status === 'APPROVED').length;
    const blocked = records.filter((r) => r.status === 'BLOCKED').length;
    const pending = records.filter((r) => r.status === 'REVIEW_REQUIRED').length;
    const volume = records.reduce((sum, r) => sum + (r.purchaseIntent.amount || 0), 0);

    return {
      evaluatedCount: total,
      approvedCount: approved,
      approvalRate: Math.round((approved / total) * 1000) / 10,
      blockedCount: blocked,
      blockedRate: Math.round((blocked / total) * 1000) / 10,
      pendingCount: pending,
      totalSimulatedVolume: Math.round(volume * 100) / 100,
    };
  };

  // Fetch backend health status
  const refreshBackendHealth = useCallback(async () => {
    setBackendStatus((prev) => ({ ...prev, isLoading: true }));
    const result = await checkBackendHealth();

    setBackendStatus({
      isConnected: result.success,
      isLoading: false,
      error: result.error || null,
      data: result.data,
      latencyMs: result.latencyMs,
      lastChecked: new Date(),
    });
  }, []);

  // Fetch decisions from backend
  const loadDecisions = useCallback(async () => {
    const res = await fetchDecisions();
    if (res.success && res.data) {
      setDecisions(res.data);
      setMetrics(computeMetrics(res.data));
    }
  }, []);

  // Poll backend health and decisions on initial mount
  useEffect(() => {
    refreshBackendHealth();
    loadDecisions();
  }, [refreshBackendHealth, loadDecisions]);

  // Handle new decision evaluated by backend engine
  const handleDecisionEvaluated = (newDecision: AuthorizationDecision) => {
    setDecisions((prev) => {
      const updated = [newDecision, ...prev];
      setMetrics(computeMetrics(updated));
      return updated;
    });
  };

  // Handle decision updated via supervisor review
  const handleDecisionUpdated = (updatedDecision: AuthorizationDecision) => {
    setDecisions((prev) => {
      const updated = prev.map((d) => (d.decisionId === updatedDecision.decisionId ? updatedDecision : d));
      setMetrics(computeMetrics(updated));
      return updated;
    });
    setLastReviewedDecisionId(updatedDecision.decisionId);
  };

  const handleSelectDecisionForCheckout = (decision: AuthorizationDecision) => {
    setResumedDecision(decision);
    setCurrentTab('overview');
    setTimeout(() => {
      requestEntryRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleScrollToSimulator = () => {
    setCurrentTab('overview');
    setTimeout(() => {
      requestEntryRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleReturnFromPayment = () => {
    window.history.replaceState({}, '', '/');
    setReturnMode(null);
    setCurrentTab('paypal_orders');
    loadDecisions();
  };

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        backendStatus={backendStatus}
        onRefreshBackend={refreshBackendHealth}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
        onOpenSimulatorShortcut={handleScrollToSimulator}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex">
        {/* Left Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          mobileMenuOpen={mobileMenuOpen}
          onCloseMobileMenu={() => setMobileMenuOpen(false)}
        />

        {/* Content Area */}
        <main className="flex-1 lg:pl-64 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
          {/* Top Operational Status Banner */}
          <BackendStatusBanner
            status={backendStatus}
            onRefresh={refreshBackendHealth}
          />

          {/* Special Return Flow from PayPal Sandbox Checkout */}
          {returnMode ? (
            <PaymentReturnView
              mode={returnMode}
              onReturnToDashboard={handleReturnFromPayment}
            />
          ) : (
            <>
              {/* Tab 1: Overview Dashboard */}
              {currentTab === 'overview' && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Dashboard Headline & Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                        PayGuard Pre-Transaction & PayPal Sandbox Portal
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        AI purchase authorization engine and PayPal Orders API v2 checkout settlement.
                      </p>
                    </div>

                    {/* State view toggle (Active Stream vs Empty State) */}
                    <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
                      <span className="text-[11px] text-slate-400 pl-2">Display Mode:</span>
                      <button
                        onClick={() => setIsEmptyStateView(false)}
                        className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                          !isEmptyStateView
                            ? 'bg-slate-800 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Active Decision Stream
                      </button>
                      <button
                        onClick={() => setIsEmptyStateView(true)}
                        className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                          isEmptyStateView
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/50 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Empty State View
                      </button>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <MetricsGrid
                    metrics={metrics}
                    isEmptyState={isEmptyStateView}
                  />

                  {/* AI Purchase Request Entry Area */}
                  <div ref={requestEntryRef}>
                    <AIRequestEntry 
                      onDecisionEvaluated={handleDecisionEvaluated} 
                      lastReviewedDecisionId={lastReviewedDecisionId}
                      initialDecision={resumedDecision}
                    />
                  </div>

                  {/* Recent Payment Activity Table */}
                  <RecentActivityTable
                    decisions={decisions}
                    onDecisionUpdated={handleDecisionUpdated}
                    onSelectDecisionForCheckout={handleSelectDecisionForCheckout}
                    isEmptyState={isEmptyStateView}
                  />

                  {/* Security Architecture Notice */}
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-3">
                    <Info className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-semibold text-slate-200">
                        Phase 3 PayPal Sandbox Integration Notice:
                      </span>
                      <p className="leading-relaxed">
                        PayPal Orders are created using intent <code>CAPTURE</code> against the official Sandbox API. Capture is executed strictly server-side upon buyer approval. Unapproved or review-required requests are prohibited from creating PayPal orders.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: AI Agent Simulator Standalone */}
              {currentTab === 'ai_agent' && (
                <div className="space-y-6 animate-fadeIn">
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">
                      Autonomous AI Agent Guardrail Engine
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Evaluate purchase intentions against the backend policy service and initiate verified PayPal Sandbox checkout.
                    </p>
                  </div>

                  <AIRequestEntry 
                    onDecisionEvaluated={handleDecisionEvaluated} 
                    lastReviewedDecisionId={lastReviewedDecisionId}
                    initialDecision={resumedDecision}
                  />

                  <RecentActivityTable
                    decisions={decisions}
                    onDecisionUpdated={handleDecisionUpdated}
                    onSelectDecisionForCheckout={handleSelectDecisionForCheckout}
                    isEmptyState={false}
                  />
                </div>
              )}

              {/* Tab 3: Policies & Rules View */}
              {currentTab === 'policies' && (
                <div className="animate-fadeIn">
                  <PoliciesView />
                </div>
              )}

              {/* Tab 4: Transactions Stream Standalone */}
              {currentTab === 'transactions' && (
                <div className="space-y-6 animate-fadeIn">
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">
                      Authorization Audit Trail
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Auditable history of pre-transaction evaluations recorded in the repository.
                    </p>
                  </div>

                  <RecentActivityTable
                    decisions={decisions}
                    onDecisionUpdated={handleDecisionUpdated}
                    onSelectDecisionForCheckout={handleSelectDecisionForCheckout}
                    isEmptyState={isEmptyStateView}
                  />
                </div>
              )}

              {/* Tab 5: Payment Passports View */}
              {currentTab === 'payment_passports' && (
                <div className="animate-fadeIn">
                  <PassportsView />
                </div>
              )}

              {/* Tab 6: PayPal Sandbox Orders View */}
              {currentTab === 'paypal_orders' && (
                <div className="animate-fadeIn">
                  <PayPalOrdersView />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
