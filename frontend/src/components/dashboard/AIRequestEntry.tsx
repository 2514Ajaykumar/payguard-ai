import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Sparkles, 
  ShieldCheck, 
  AlertCircle, 
  ShieldAlert, 
  CornerDownLeft, 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Server, 
  ExternalLink, 
  CreditCard, 
  Search, 
  Compass, 
  ArrowRight, 
  ArrowLeft,
  Info, 
  Check, 
  RefreshCw,
  Zap,
  Sliders
} from 'lucide-react';
import { 
  evaluatePurchaseIntent, 
  createPaymentOrder, 
  discoverProducts, 
  fetchDecisionById,
  parsePurchaseIntent 
} from '../../services/api';
import { 
  AuthorizationDecision, 
  PurchaseIntent, 
  CreateOrderResult, 
  DiscoveredProduct, 
  DiscoveryResponse,
  ExtractedPurchaseIntent 
} from '../../types';
import { Badge } from '../common/Badge';

interface AIRequestEntryProps {
  onDecisionEvaluated: (decision: AuthorizationDecision) => void;
  lastReviewedDecisionId?: string | null;
  initialDecision?: AuthorizationDecision | null;
}

type WorkflowStep = 1 | 2 | 3 | 4 | 5;

export const AIRequestEntry: React.FC<AIRequestEntryProps> = ({ 
  onDecisionEvaluated,
  lastReviewedDecisionId,
  initialDecision,
}) => {
  // Mode switcher: 'guided' (default) vs 'advanced'
  const [simulatorMode, setSimulatorMode] = useState<'guided' | 'advanced'>('guided');
  const [activeStep, setActiveStep] = useState<WorkflowStep>(1);

  // Common purchase parameters
  const [prompt, setPrompt] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [merchantDomain, setMerchantDomain] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState('USD');
  const [category, setCategory] = useState('');
  const [agentId, setAgentId] = useState('DevOps-Autonomous-Bot-4');
  const [userBudgetLimit, setUserBudgetLimit] = useState<string>('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState<AuthorizationDecision | null>(null);

  // Stage 1: Intent Understanding State
  const [intentInput, setIntentInput] = useState('Find a cloud VPS provider for my development environment. Keep the monthly cost below $20.');
  const [isParsingIntent, setIsParsingIntent] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [extractedIntent, setExtractedIntent] = useState<ExtractedPurchaseIntent | null>(null);

  // Stage 2: Merchant & Product Discovery State
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryResponse, setDiscoveryResponse] = useState<DiscoveryResponse | null>(null);
  const [discoveryResults, setDiscoveryResults] = useState<DiscoveredProduct[] | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<DiscoveredProduct | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);

  // Stage 4/5: PayPal Order creation state
  const [isCreatingPayPalOrder, setIsCreatingPayPalOrder] = useState(false);
  const [payPalError, setPayPalError] = useState<string | null>(null);
  const [payPalOrderResult, setPayPalOrderResult] = useState<CreateOrderResult | null>(null);

  // Supervisor decision synchronization state
  const [isRefreshingDecision, setIsRefreshingDecision] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Authoritative decision refresh handler
  const refreshDecisionStatus = async (targetDecisionId: string) => {
    setIsRefreshingDecision(true);
    setSyncNotice(null);

    const res = await fetchDecisionById(targetDecisionId);
    setIsRefreshingDecision(false);

    if (res.success && res.data) {
      const refreshed = res.data;
      setLastDecision(refreshed);

      if (refreshed.status === 'APPROVED' && refreshed.canProceedToPayment) {
        setSyncNotice(`Decision "${refreshed.decisionId}" verified as APPROVED by supervisor. PayPal checkout gate unlocked!`);
        setPayPalError(null);
        setPayPalOrderResult(null);
      } else if (refreshed.status === 'BLOCKED') {
        setSyncNotice(`Decision "${refreshed.decisionId}" was reviewed and permanently BLOCKED. Payment prohibited.`);
      } else {
        setSyncNotice(`Decision "${refreshed.decisionId}" status: ${refreshed.status}. Awaiting supervisor sign-off.`);
      }
    } else {
      setSyncNotice(`Failed to refresh decision status: ${res.error || 'Network error'}`);
    }
  };

  // Synchronize when supervisor reviews/approves a decision in RecentActivityTable
  useEffect(() => {
    if (!lastReviewedDecisionId) return;
    if (lastDecision && lastDecision.decisionId === lastReviewedDecisionId) {
      refreshDecisionStatus(lastReviewedDecisionId);
    }
  }, [lastReviewedDecisionId]);

  // Handle resumed decision from Recent Activity Inspector
  useEffect(() => {
    if (!initialDecision || !initialDecision.decisionId) return;

    // 1. Switch to Guided Flow
    setSimulatorMode('guided');

    // 2. Load original purchase intent parameters from the existing decision
    const pi = initialDecision.purchaseIntent;
    if (pi) {
      if (pi.merchantName) setMerchantName(pi.merchantName);
      if (pi.merchantDomain) setMerchantDomain(pi.merchantDomain);
      if (pi.amount !== undefined && pi.amount !== null && !isNaN(Number(pi.amount))) {
        setAmount(String(pi.amount));
      }
      if (pi.currency) setCurrency(pi.currency);
      if (pi.userBudgetLimit !== undefined && pi.userBudgetLimit !== null && !isNaN(Number(pi.userBudgetLimit))) {
        setUserBudgetLimit(String(pi.userBudgetLimit));
      } else {
        setUserBudgetLimit('');
      }
      if (pi.agentId) setAgentId(pi.agentId);
      if (pi.description) setPrompt(pi.description);
      if (pi.category) setCategory(pi.category);
    }

    // 3. Clear transient states
    setSelectedCandidate(null);
    setSelectionNotice(null);
    setPayPalOrderResult(null);
    setPayPalError(null);
    setBackendError(null);

    // 4. Initially display the existing decision and navigate directly to authorization stage
    setLastDecision(initialDecision);
    setActiveStep(4);

    // 5. Authoritatively re-fetch decision from backend before enabling checkout
    let isMounted = true;
    setIsRefreshingDecision(true);
    setSyncNotice(`Resumed decision "${initialDecision.decisionId}". Verifying status with backend...`);

    fetchDecisionById(initialDecision.decisionId)
      .then((res) => {
        if (!isMounted) return;
        setIsRefreshingDecision(false);

        if (res.success && res.data) {
          const verified = res.data;
          setLastDecision(verified);

          if (verified.status === 'APPROVED' && verified.canProceedToPayment) {
            setSyncNotice(
              `Decision "${verified.decisionId}" verified as APPROVED by backend. Ready for PayPal Sandbox checkout.`
            );
          } else if (verified.status === 'BLOCKED') {
            setSyncNotice(
              `Decision "${verified.decisionId}" is BLOCKED in backend. PayPal checkout locked.`
            );
          } else if (verified.status === 'REVIEW_REQUIRED') {
            setSyncNotice(
              `Decision "${verified.decisionId}" requires supervisor review. PayPal checkout locked.`
            );
          } else {
            setSyncNotice(
              `Decision "${verified.decisionId}" status: ${verified.status}. PayPal checkout locked.`
            );
          }
        } else {
          // If backend fetch fails, lock checkout for safety
          setLastDecision({
            ...initialDecision,
            canProceedToPayment: false,
          });
          setSyncNotice(
            `Failed to verify decision with backend (${res.error || 'Network error'}). Checkout locked.`
          );
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setIsRefreshingDecision(false);
        setLastDecision({
          ...initialDecision,
          canProceedToPayment: false,
        });
        setSyncNotice(
          `Error verifying decision: ${err instanceof Error ? err.message : String(err)}. Checkout locked.`
        );
      });

    return () => {
      isMounted = false;
    };
  }, [initialDecision]);

  // Stage 1 Action: Parse Intent using Groq LLM
  const handleUnderstandIntent = async () => {
    if (!intentInput.trim()) return;

    setIsParsingIntent(true);
    setIntentError(null);

    const res = await parsePurchaseIntent(intentInput.trim());
    setIsParsingIntent(false);

    if (res.success && res.data) {
      const intent = res.data.intent;
      setExtractedIntent(intent);

      // Pre-fill fields where intent provided values
      if (intent.merchant) setMerchantName(intent.merchant);
      if (intent.domain) setMerchantDomain(intent.domain);
      if (intent.product) setPrompt(`Purchase request for ${intent.product}`);
      if (intent.budget !== null && intent.budget !== undefined && !isNaN(intent.budget)) {
        setUserBudgetLimit(String(intent.budget));
      }
      if (intent.currency) {
        const upper = intent.currency.toUpperCase();
        if (['USD', 'EUR', 'GBP', 'CAD', 'AUD'].includes(upper)) {
          setCurrency(upper);
        }
      }
      // Note: we strictly do NOT auto-set amount from untrusted suggestion.
    } else {
      setIntentError(res.error || 'Failed to extract purchase intent.');
    }
  };

  // Stage 2 Action: Discover Merchants using Tavily
  const handleDiscover = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = discoveryQuery.trim() || intentInput.trim();
    if (!query) return;

    setIsSearching(true);
    setDiscoveryError(null);
    setDiscoveryResults(null);
    setSelectedCandidate(null);
    setSelectionNotice(null);

    const res = await discoverProducts({
      message: query,
      maxResults: 6,
    });

    setIsSearching(false);

    if (res.success && res.data) {
      setDiscoveryResponse(res.data);
      setDiscoveryResults(res.data.results || []);

      // If discovery returned an extracted intent and Stage 1 was skipped, sync it
      if (res.data.extractedIntent && !extractedIntent) {
        setExtractedIntent(res.data.extractedIntent);
      }
    } else {
      setDiscoveryError(res.error || 'Failed to discover products and merchants.');
    }
  };

  // Handle selecting a candidate from discovery results
  const handleSelectCandidate = (candidate: DiscoveredProduct) => {
    const chosenMerchant = candidate.merchantName || candidate.merchantDomain || candidate.title;
    setMerchantName(chosenMerchant);

    if (candidate.merchantDomain) {
      setMerchantDomain(candidate.merchantDomain);
    } else {
      try {
        const parsed = new URL(candidate.sourceUrl);
        setMerchantDomain(parsed.hostname.replace(/^www\./, ''));
      } catch {
        // safe fallback
      }
    }

    setPrompt(`Purchase request for ${candidate.title} from ${chosenMerchant}`);

    if (
      discoveryResponse?.extractedIntent?.budget !== undefined &&
      discoveryResponse.extractedIntent.budget !== null &&
      typeof discoveryResponse.extractedIntent.budget === 'number' &&
      !isNaN(discoveryResponse.extractedIntent.budget)
    ) {
      setUserBudgetLimit(String(discoveryResponse.extractedIntent.budget));
    }

    // Security requirement: Never set amount from unverified price
    setAmount('');

    if (candidate.currency) {
      const upper = candidate.currency.toUpperCase();
      if (['USD', 'EUR', 'GBP', 'CAD', 'AUD'].includes(upper)) {
        setCurrency(upper);
      }
    } else if (discoveryResponse?.extractedIntent?.currency) {
      const upper = discoveryResponse.extractedIntent.currency.toUpperCase();
      if (['USD', 'EUR', 'GBP', 'CAD', 'AUD'].includes(upper)) {
        setCurrency(upper);
      }
    }

    setSelectedCandidate(candidate);
    setSelectionNotice(
      `Candidate "${chosenMerchant}" selected. Detected prices are unverified. Please confirm the exact transaction amount and budget in the fields below before evaluating.`
    );

    setLastDecision(null);
    setPayPalOrderResult(null);
    setBackendError(null);
    setPayPalError(null);
    setSyncNotice(null);
  };

  // Stage 3 -> 4 Action: Submit to Deterministic Authorization Engine
  const handleConfirmAndEvaluate = async () => {
    const parsedAmount = parseFloat(amount);
    if (!merchantName.trim()) {
      setBackendError('Merchant name is required for corporate policy check.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setBackendError('Please enter a confirmed, positive transaction amount.');
      return;
    }

    setActiveStep(4);
    setIsEvaluating(true);
    setBackendError(null);
    setPayPalError(null);
    setPayPalOrderResult(null);
    setSyncNotice(null);

    const parsedBudget = userBudgetLimit ? parseFloat(userBudgetLimit) : undefined;
    const payload: PurchaseIntent = {
      agentId: agentId.trim() || 'Anonymous-Agent',
      merchantName: merchantName.trim(),
      merchantDomain: merchantDomain.trim() || undefined,
      category: category.trim() || undefined,
      amount: parsedAmount,
      currency: currency.trim() || 'USD',
      description: prompt.trim() || undefined,
      userBudgetLimit: parsedBudget !== undefined && !isNaN(parsedBudget) ? parsedBudget : undefined,
    };

    const result = await evaluatePurchaseIntent(payload);
    setIsEvaluating(false);

    if (result.success && result.data) {
      setLastDecision(result.data);
      onDecisionEvaluated(result.data);
    } else {
      setBackendError(result.error || 'Failed to communicate with authorization service');
    }
  };

  // Stage 5 Action: PayPal Sandbox Order Creation
  const handleInitiatePayPalOrder = async (retry = false) => {
    if (!lastDecision || lastDecision.status !== 'APPROVED' || !lastDecision.canProceedToPayment) {
      return;
    }

    setIsCreatingPayPalOrder(true);
    setPayPalError(null);

    const res = await createPaymentOrder(lastDecision.decisionId, { retry });
    setIsCreatingPayPalOrder(false);

    if (res.success && res.data) {
      setPayPalOrderResult(res.data);
    } else {
      setPayPalError(res.error || 'Failed to create PayPal Sandbox order.');
    }
  };

  // Reset Guided Flow back to Stage 1
  const handleResetGuidedFlow = () => {
    setActiveStep(1);
    setIntentInput('Find a cloud VPS provider for my development environment. Keep the monthly cost below $20.');
    setExtractedIntent(null);
    setIntentError(null);
    setSelectedCandidate(null);
    setSelectionNotice(null);
    setLastDecision(null);
    setPayPalOrderResult(null);
    setPayPalError(null);
    setBackendError(null);
    setAmount('');
    setMerchantName('');
    setMerchantDomain('');
    setPrompt('');
  };

  // Preset scenarios for Advanced Mode
  const sampleScenarios = [
    {
      title: 'Auto-Approval (<= $100)',
      prompt: 'Authorize monthly renewal for GitHub Copilot Team seat ($45/month).',
      merchantName: 'GitHub Inc.',
      merchantDomain: 'github.com',
      amount: '45.00',
      category: 'Developer Infrastructure',
      budget: '200.00',
    },
    {
      title: 'Review Required ($100 - $500)',
      prompt: 'Provision staging cloud cluster for testing PR #412 ($320.00).',
      merchantName: 'CloudScale Global Ltd.',
      merchantDomain: 'cloudscale-infra.io',
      amount: '320.00',
      category: 'Cloud Hosting Services',
      budget: '1000.00',
    },
    {
      title: 'Explicit Approval (> $500)',
      prompt: 'Lease high-performance GPU cluster for embedding indexing ($1,450.00).',
      merchantName: 'Lambda GPU Cloud',
      merchantDomain: 'lambdalabs.com',
      amount: '1450.00',
      category: 'Infrastructure',
      budget: '2500.00',
    },
    {
      title: 'Budget Violation',
      prompt: 'Renew analytics tool ($85.00) with a user budget cap of $50.00.',
      merchantName: 'Mixpanel Inc.',
      merchantDomain: 'mixpanel.com',
      amount: '85.00',
      category: 'Analytics',
      budget: '50.00',
    },
    {
      title: 'Blocked: Prohibited TLD',
      prompt: 'Checkout vouchers on instant crypto card exchange (.xyz domain).',
      merchantName: 'InstantCrypto Shop',
      merchantDomain: 'crypto-exchange-fast.xyz',
      amount: '95.00',
      category: 'Vouchers / Crypto',
      budget: '',
    },
    {
      title: 'Safely Reject Invalid',
      prompt: 'Malformed checkout intent with negative spend (-$25.00).',
      merchantName: 'Test Vendor',
      merchantDomain: 'test.com',
      amount: '-25.00',
      category: 'Test',
      budget: '',
    },
  ];

  const handleApplyScenario = (scenario: (typeof sampleScenarios)[0]) => {
    setPrompt(scenario.prompt);
    setMerchantName(scenario.merchantName);
    setMerchantDomain(scenario.merchantDomain);
    setAmount(scenario.amount);
    setCategory(scenario.category);
    setUserBudgetLimit(scenario.budget);
    setBackendError(null);
    setPayPalError(null);
    setPayPalOrderResult(null);
    setSelectedCandidate(null);
    setSelectionNotice(null);
    setSyncNotice(null);
  };

  // Advanced Mode Manual Evaluation Handler
  const handleEvaluateAdvanced = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantName.trim() && !prompt.trim()) return;

    setIsEvaluating(true);
    setBackendError(null);
    setPayPalError(null);
    setPayPalOrderResult(null);
    setSyncNotice(null);

    const parsedAmount = parseFloat(amount);
    const parsedBudget = userBudgetLimit ? parseFloat(userBudgetLimit) : undefined;

    const payload: PurchaseIntent = {
      agentId: agentId.trim() || 'Anonymous-Agent',
      merchantName: merchantName.trim() || 'Unknown Merchant',
      merchantDomain: merchantDomain.trim() || undefined,
      category: category.trim() || undefined,
      amount: isNaN(parsedAmount) ? (amount as unknown as number) : parsedAmount,
      currency: currency.trim() || 'USD',
      description: prompt.trim() || undefined,
      userBudgetLimit: parsedBudget !== undefined && !isNaN(parsedBudget) ? parsedBudget : undefined,
    };

    const result = await evaluatePurchaseIntent(payload);
    setIsEvaluating(false);

    if (result.success && result.data) {
      setLastDecision(result.data);
      onDecisionEvaluated(result.data);
    } else {
      setBackendError(result.error || 'Failed to communicate with authorization service');
    }
  };

  const workflowSteps = [
    { num: 1 as WorkflowStep, label: 'Intent Understanding' },
    { num: 2 as WorkflowStep, label: 'Merchant Discovery' },
    { num: 3 as WorkflowStep, label: 'Confirmation' },
    { num: 4 as WorkflowStep, label: 'Authorization' },
    { num: 5 as WorkflowStep, label: 'PayPal Checkout' },
  ];

  return (
    <div className="rounded-xl bg-background-surface border border-slate-800 shadow-xl overflow-hidden">
      {/* Top Header with Mode Switcher */}
      <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">
                PayGuard Agent Purchase Engine
              </h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                <Server className="w-2.5 h-2.5" />
                Backend Authoritative
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Groq Intent Extraction &bull; Tavily Discovery &bull; Deterministic Policy &bull; PayPal Orders v2
            </p>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setSimulatorMode('guided')}
            className={`px-3 py-1.5 text-xs rounded-md font-semibold transition-all flex items-center gap-1.5 ${
              simulatorMode === 'guided'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Guided Smart Flow</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-900/60 text-cyan-200 font-mono">
              5-Stage
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSimulatorMode('advanced')}
            className={`px-3 py-1.5 text-xs rounded-md font-semibold transition-all flex items-center gap-1.5 ${
              simulatorMode === 'advanced'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span>Advanced / Manual Simulator</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODE 1: GUIDED 5-STAGE SMART AGENT WORKFLOW                               */}
      {/* ========================================================================= */}
      {simulatorMode === 'guided' && (
        <div className="p-5 space-y-6">
          {/* Stepper Navigation */}
          <div className="bg-slate-950/80 border border-slate-800/80 p-3 sm:p-4 rounded-xl">
            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1">
              {workflowSteps.map((step, idx) => {
                const isPassed = activeStep > step.num;
                const isCurrent = activeStep === step.num;
                const isStep5Unlocked =
                  step.num === 5 &&
                  Boolean(lastDecision?.status === 'APPROVED' && lastDecision?.canProceedToPayment);
                const isClickable = isPassed || isCurrent || isStep5Unlocked;

                return (
                  <React.Fragment key={step.num}>
                    <button
                      type="button"
                      onClick={() => {
                        // Allow clicking past completed steps, current step, or unlocked checkout
                        if (isClickable) {
                          setActiveStep(step.num);
                        }
                      }}
                      disabled={!isClickable}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                        isCurrent
                          ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                          : isPassed || isStep5Unlocked
                          ? 'text-emerald-400 hover:bg-slate-900 cursor-pointer'
                          : 'text-slate-500 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                          isCurrent
                            ? 'bg-cyan-500 text-slate-950 ring-2 ring-cyan-500/30'
                            : isPassed
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : isStep5Unlocked
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {isPassed ? <Check className="w-3 h-3" /> : step.num}
                      </div>
                      <span className="hidden md:inline">{step.label}</span>
                    </button>
                    {idx < workflowSteps.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 min-w-4 max-w-10 rounded ${
                          activeStep > step.num ? 'bg-emerald-500/40' : 'bg-slate-800'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* ------------------------------------------------------------------- */}
          {/* STAGE 1: INTENT UNDERSTANDING                                       */}
          {/* ------------------------------------------------------------------- */}
          {activeStep === 1 && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-xs">1</span>
                    Natural-Language Intent Understanding
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Describe your purchase in plain English. Groq LLM extracts structured intent parameters and identifies gaps.
                  </p>
                </div>
              </div>

              {/* Sample Prompts */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 font-medium">Quick Demo Prompts:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Find a cloud VPS provider for my development environment. Keep the monthly cost below $20.',
                    'Authorize monthly renewal for GitHub Copilot Team seat ($45/month).',
                    'Provision staging cloud cluster for PR #412 ($320.00) with budget $1000.',
                    'Instant vouchers on crypto card exchange (.xyz domain).'
                  ].map((demo, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setIntentInput(demo);
                        setExtractedIntent(null);
                        setIntentError(null);
                      }}
                      className="text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all text-left truncate max-w-md"
                    >
                      &quot;{demo}&quot;
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea Input */}
              <div className="space-y-3">
                <textarea
                  value={intentInput}
                  onChange={(e) => setIntentInput(e.target.value)}
                  rows={3}
                  placeholder="e.g. Find a cloud VPS provider for my development environment. Keep the monthly cost below $20."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all"
                />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Calls <code>POST /api/agent/parse-intent</code> via Groq OpenAI-compatible LLM</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleUnderstandIntent}
                    disabled={isParsingIntent || !intentInput.trim()}
                    className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/20 transition-all disabled:opacity-50"
                  >
                    {isParsingIntent ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Understanding Intent with Groq...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
                        <span>Understand Purchase Intent</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Error Banner */}
              {intentError && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{intentError}</span>
                </div>
              )}

              {/* Structured Extracted Intent Result Card */}
              {extractedIntent && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Extracted Purchase Intent
                      </span>
                    </div>
                    <span className="text-[10px] text-amber-300/90 font-mono flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Untrusted Suggestion &bull; Verification Required
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase">Product</span>
                      <span className="font-semibold text-white truncate block">
                        {extractedIntent.product || 'Not specified'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase">Merchant</span>
                      <span className={`font-semibold truncate block ${extractedIntent.merchant ? 'text-white' : 'text-amber-400 italic'}`}>
                        {extractedIntent.merchant || 'Discovery Needed'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase">Stated Budget</span>
                      <span className="font-semibold text-emerald-400">
                        {extractedIntent.budget !== null ? `$${extractedIntent.budget}` : 'None'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase">Billing Period</span>
                      <span className="font-semibold text-slate-300">
                        {extractedIntent.billingPeriod || 'Unspecified'}
                      </span>
                    </div>
                  </div>

                  {/* Missing Information Tag list */}
                  {extractedIntent.missingInformation && extractedIntent.missingInformation.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-amber-400 font-medium">Missing Information:</span>
                      {extractedIntent.missingInformation.map((info, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50 text-[10px] font-mono"
                        >
                          {info}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Next Step Guidance Actions */}
                  <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800/80">
                    <p className="text-[11px] text-slate-400">
                      {!extractedIntent.merchant || extractedIntent.missingInformation.includes('merchant')
                        ? 'Merchant is missing. Proceed to Merchant Discovery to find matching providers online.'
                        : 'Merchant and product identified. You can proceed directly to confirmation or explore options.'}
                    </p>

                    <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                      {extractedIntent.merchant && (
                        <button
                          type="button"
                          onClick={() => {
                            setDiscoveryQuery(intentInput);
                            setActiveStep(2);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all flex items-center gap-1.5"
                        >
                          <span>Discover Alternatives</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          if (!extractedIntent.merchant || extractedIntent.missingInformation.includes('merchant')) {
                            setDiscoveryQuery(intentInput);
                            setActiveStep(2);
                          } else {
                            setActiveStep(3);
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5"
                      >
                        <span>
                          {!extractedIntent.merchant || extractedIntent.missingInformation.includes('merchant')
                            ? 'Proceed to Discovery'
                            : 'Continue to Confirmation'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------------- */}
          {/* STAGE 2: MERCHANT DISCOVERY                                         */}
          {/* ------------------------------------------------------------------- */}
          {activeStep === 2 && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-xs">2</span>
                    Merchant & Product Discovery (Tavily Web Search)
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Search official vendor pricing pages and plans online. Prices extracted from snippets are unverified estimates.
                  </p>
                </div>
              </div>

              {/* Search Box */}
              <div className="space-y-2.5">
                <textarea
                  value={discoveryQuery}
                  onChange={(e) => setDiscoveryQuery(e.target.value)}
                  rows={2}
                  placeholder="e.g. Find me cloud VPS hosting providers under 20 USD per month..."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all resize-none"
                />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-slate-500" />
                    <span>Executes <code>POST /api/agent/discover</code></span>
                  </div>

                  <button
                    type="button"
                    onClick={handleDiscover}
                    disabled={isSearching || (!discoveryQuery.trim() && !intentInput.trim())}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-md shadow-cyan-900/20 transition-all disabled:opacity-50 self-start sm:self-auto"
                  >
                    {isSearching ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Searching Vendors Online...</span>
                      </>
                    ) : (
                      <>
                        <Compass className="w-3.5 h-3.5" />
                        <span>Discover Merchants & Products</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Discovery Error */}
              {discoveryError && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{discoveryError}</span>
                </div>
              )}

              {/* Candidate Cards Grid */}
              {discoveryResults && discoveryResults.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Discovered Candidates ({discoveryResults.length} found):
                    </span>
                    <span className="text-[10px] text-amber-400/90 flex items-center gap-1 font-mono">
                      <AlertTriangle className="w-3 h-3" />
                      Select one candidate to transfer details
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {discoveryResults.map((product, idx) => {
                      const displayName = product.merchantName || product.merchantDomain || product.title;
                      const isSelected = selectedCandidate?.sourceUrl === product.sourceUrl;

                      return (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                            isSelected
                              ? 'bg-cyan-950/40 border-cyan-500/70 shadow-lg shadow-cyan-950/50'
                              : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h5 className="text-xs font-bold text-white truncate" title={displayName}>
                                  {displayName}
                                </h5>
                                {product.merchantDomain && (
                                  <span className="text-[10px] font-mono text-cyan-400 truncate block">
                                    {product.merchantDomain}
                                  </span>
                                )}
                              </div>

                              <a
                                href={product.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors flex-shrink-0"
                                title="Open provider page in new tab"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>

                            <p className="text-xs font-medium text-slate-200 line-clamp-2" title={product.title}>
                              {product.title}
                            </p>

                            <p className="text-[11px] text-slate-400 line-clamp-3 leading-relaxed">
                              {product.description}
                            </p>

                            <div className="pt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80">
                              {product.unverifiedListedPrice !== null ? (
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded font-mono font-medium bg-amber-950/60 text-amber-300 border border-amber-800/50"
                                  title="Unverified estimate from search snippet"
                                >
                                  Unverified: {product.currency ? `${product.currency} ` : '$'}{product.unverifiedListedPrice}
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded font-mono text-slate-400 bg-slate-900 border border-slate-800">
                                  Price not verified
                                </span>
                              )}

                              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-slate-400 bg-slate-900 border border-slate-800">
                                Rel: {Math.round(product.relevanceScore * 100)}%
                              </span>
                            </div>
                          </div>

                          <div className="pt-3 mt-2 border-t border-slate-800/60">
                            <button
                              type="button"
                              onClick={() => handleSelectCandidate(product)}
                              className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                                isSelected
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/80'
                                  : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700/80'
                              }`}
                            >
                              {isSelected ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Selected for Guardrail Check</span>
                                </>
                              ) : (
                                <>
                                  <span>Select Candidate</span>
                                  <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selection Notice */}
              {selectionNotice && (
                <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/60 text-cyan-200 text-xs flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">{selectionNotice}</p>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="pt-3 flex items-center justify-between border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Intent</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  disabled={!merchantName.trim()}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>Continue to Confirmation</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------------- */}
          {/* STAGE 3: PURCHASE CONFIRMATION                                      */}
          {/* ------------------------------------------------------------------- */}
          {activeStep === 3 && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-xs">3</span>
                    Purchase Confirmation & Amount Verification
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Security Invariant: Explicitly confirm the exact transaction amount and parameters. Discovered prices are never auto-billed.
                  </p>
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Merchant / Payee Name *
                  </label>
                  <input
                    type="text"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    placeholder="e.g. GitHub Inc."
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Merchant Domain
                  </label>
                  <input
                    type="text"
                    value={merchantDomain}
                    onChange={(e) => setMerchantDomain(e.target.value)}
                    placeholder="e.g. github.com"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Confirmed Transaction Amount *
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="e.g. 45.00"
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-cyan-500/50 text-white text-xs font-bold font-mono focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                    />
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="px-2 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="CAD">CAD</option>
                      <option value="AUD">AUD</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Stated User Budget Cap
                  </label>
                  <input
                    type="text"
                    value={userBudgetLimit}
                    onChange={(e) => setUserBudgetLimit(e.target.value)}
                    placeholder="Optional (e.g. 50.00)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Requesting Agent ID *
                  </label>
                  <input
                    type="text"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    placeholder="DevOps-Bot-01"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Merchant Category
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Cloud Infrastructure"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Intent Description / Justification
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={2}
                  placeholder="Justification statement for spending policies"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none resize-none"
                />
              </div>

              {/* Confirmation Recap Box */}
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider block">
                  Confirmation Summary before Guardrail Evaluation:
                </span>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono text-slate-300">
                  <div>Merchant: <span className="text-white font-semibold">{merchantName || '—'}</span></div>
                  <div>Domain: <span className="text-cyan-400">{merchantDomain || 'unspecified'}</span></div>
                  <div>Amount: <span className="text-emerald-400 font-bold">{amount ? `$${amount} ${currency}` : 'NOT ENTERED'}</span></div>
                  <div>Budget Cap: <span className="text-slate-200">{userBudgetLimit ? `$${userBudgetLimit}` : 'None'}</span></div>
                  <div>Agent: <span className="text-slate-400">{agentId}</span></div>
                </div>
              </div>

              {backendError && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{backendError}</span>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="pt-3 flex items-center justify-between border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Discovery</span>
                </button>

                <button
                  type="button"
                  onClick={handleConfirmAndEvaluate}
                  disabled={!merchantName.trim() || !amount.trim() || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-900/30 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Submit to Authorization Engine</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------------- */}
          {/* STAGE 4: AUTHORIZATION                                              */}
          {/* ------------------------------------------------------------------- */}
          {activeStep === 4 && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-xs">4</span>
                    Authoritative Policy Engine Evaluation
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Evaluated deterministically by PayGuard AI against corporate spend policies, auto-approval thresholds, and whitelists.
                  </p>
                </div>
              </div>

              {isEvaluating ? (
                <div className="p-8 text-center space-y-3">
                  <div className="w-8 h-8 mx-auto border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-300 font-mono">Evaluating intent with backend policy engine...</p>
                </div>
              ) : lastDecision ? (
                <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                  {/* Status Bar */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      {lastDecision.status === 'APPROVED' && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                          <ShieldCheck className="w-4 h-4" />
                          <span>APPROVED</span>
                        </div>
                      )}
                      {lastDecision.status === 'REVIEW_REQUIRED' && (
                        <>
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
                            <AlertTriangle className="w-4 h-4" />
                            <span>REVIEW REQUIRED</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => refreshDecisionStatus(lastDecision.decisionId)}
                            disabled={isRefreshingDecision}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/60 text-[11px] font-medium transition-all"
                            title="Poll backend for supervisor approval"
                          >
                            <RefreshCw className={`w-3 h-3 ${isRefreshingDecision ? 'animate-spin' : ''}`} />
                            <span>{isRefreshingDecision ? 'Checking...' : 'Check Supervisor Status'}</span>
                          </button>
                        </>
                      )}
                      {lastDecision.status === 'BLOCKED' && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold">
                          <ShieldAlert className="w-4 h-4" />
                          <span>BLOCKED</span>
                        </div>
                      )}

                      <div className="text-xs font-mono text-slate-400">
                        ID: <span className="text-slate-200 font-semibold">{lastDecision.decisionId}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">PayPal Order Gate:</span>
                      <span
                        className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                          lastDecision.canProceedToPayment
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {lastDecision.canProceedToPayment ? 'ELIGIBLE TO PROCEED' : 'PAYMENT PROHIBITED'}
                      </span>
                    </div>
                  </div>

                  {syncNotice && (
                    <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/60 text-cyan-200 text-xs flex items-center gap-2">
                      <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                      <span>{syncNotice}</span>
                    </div>
                  )}

                  {/* Policy Explanation */}
                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                    <strong className="text-white block mb-0.5">Authoritative Policy Explanation:</strong>
                    {lastDecision.explanation}
                  </div>

                  {/* Policy Checks Grid */}
                  <div>
                    <span className="text-[11px] text-slate-400 font-medium block mb-1.5">
                      Deterministic Checks ({lastDecision.policyChecks.length} evaluated):
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {lastDecision.policyChecks.map((check, idx) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                            check.status === 'PASSED'
                              ? 'bg-emerald-950/20 border-emerald-900/40'
                              : check.status === 'WARNING'
                              ? 'bg-amber-950/20 border-amber-900/40'
                              : 'bg-rose-950/20 border-rose-900/40'
                          }`}
                        >
                          <div className="mt-0.5 flex-shrink-0">
                            {check.status === 'PASSED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                            {check.status === 'WARNING' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                            {check.status === 'FAILED' && <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                          </div>
                          <div>
                            <div className="font-semibold text-white text-[11px] font-mono">
                              {check.checkName}
                            </div>
                            <p className="text-[11px] text-slate-300 mt-0.5">{check.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Navigation Actions */}
              <div className="pt-3 flex items-center justify-between border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveStep(3)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Edit Confirmation</span>
                </button>

                {lastDecision?.status === 'APPROVED' && lastDecision.canProceedToPayment && (
                  <button
                    type="button"
                    onClick={() => setActiveStep(5)}
                    className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2"
                  >
                    <span>Proceed to PayPal Checkout</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------------- */}
          {/* STAGE 5: PAYPAL SANDBOX CHECKOUT                                    */}
          {/* ------------------------------------------------------------------- */}
          {activeStep === 5 && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-900 text-cyan-300 flex items-center justify-center text-xs">5</span>
                    PayPal Sandbox Settlement Rails
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Authorized orders initiate official PayPal Orders API v2 capture checkout.
                  </p>
                </div>
              </div>

              {syncNotice && (
                <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/60 text-cyan-200 text-xs flex items-center gap-2">
                  <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>{syncNotice}</span>
                </div>
              )}

              {lastDecision && lastDecision.status === 'APPROVED' && lastDecision.canProceedToPayment ? (
                <div className="p-6 rounded-xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-slate-950 border border-blue-500/30 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-cyan-400" />
                        <h4 className="text-sm font-bold text-white">
                          PayPal Sandbox Orders API v2 Checkout
                        </h4>
                        <Badge variant="sandbox">Orders v2</Badge>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        Pre-transaction verification passed. Authorized spend amount:{' '}
                        <strong className="text-emerald-400 text-sm font-mono">
                          ${lastDecision.purchaseIntent.amount.toFixed(2)} {lastDecision.purchaseIntent.currency}
                        </strong>{' '}
                        for payee <strong>{lastDecision.purchaseIntent.merchantName}</strong>.
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 font-mono text-[11px] text-slate-400">
                        <span>Decision ID:</span>
                        <span className="text-cyan-300 font-semibold">{lastDecision.decisionId}</span>
                      </div>
                    </div>

                    {!payPalOrderResult && (
                      <button
                        onClick={() => handleInitiatePayPalOrder(false)}
                        disabled={isCreatingPayPalOrder}
                        className="px-6 py-3 rounded-lg bg-[#0070BA] hover:bg-[#003087] text-white text-xs font-bold transition-all shadow-xl shadow-blue-900/40 flex items-center justify-center gap-2 self-start sm:self-auto flex-shrink-0 disabled:opacity-50"
                      >
                        {isCreatingPayPalOrder ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Creating PayPal Sandbox Order...</span>
                          </>
                        ) : (
                          <>
                            <ExternalLink className="w-4 h-4" />
                            <span>Pay with PayPal Sandbox</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {payPalError && (
                    <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <strong>PayPal Error: </strong> {payPalError}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInitiatePayPalOrder(true)}
                        disabled={isCreatingPayPalOrder}
                        className="text-xs px-3 py-1.5 rounded bg-rose-900 hover:bg-rose-800 text-white font-medium border border-rose-700 transition-all flex-shrink-0"
                      >
                        Retry Order
                      </button>
                    </div>
                  )}

                  {payPalOrderResult && (
                    <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>PayPal Sandbox Order Created & Authorized</span>
                        </div>
                        <span className="font-mono text-xs text-white">ID: {payPalOrderResult.orderId}</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        Redirect to PayPal Sandbox checkout to complete buyer approval. Upon return, the backend executes server-to-server capture.
                      </p>
                      <div className="pt-2 flex flex-wrap gap-2">
                        <a
                          href={payPalOrderResult.approvalUrl}
                          target="_self"
                          rel="noreferrer"
                          className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all inline-flex items-center gap-2 shadow-lg shadow-emerald-900/30"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>Proceed to PayPal Sandbox Checkout</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => handleInitiatePayPalOrder(true)}
                          disabled={isCreatingPayPalOrder}
                          className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all border border-slate-700"
                        >
                          <span>Retry Fresh Order</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-slate-950 border border-rose-800 text-rose-300 text-xs flex flex-col gap-2">
                  <div className="flex items-center gap-2 font-bold text-rose-400">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                    <span>PayPal Sandbox Checkout Locked</span>
                  </div>
                  <p>
                    Checkout is locked because decision {lastDecision ? <code className="font-mono text-white">{lastDecision.decisionId}</code> : ''} is not approved for payment.
                    {lastDecision && <span> Current status: <strong className="text-white">{lastDecision.status}</strong>.</span>}
                  </p>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="pt-3 flex items-center justify-between border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveStep(4)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Authorization</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetGuidedFlow}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-medium border border-slate-700 transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Start New Guided Flow</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: ADVANCED / MANUAL SIMULATOR (ORIGINAL CAPABILITIES PRESERVED)     */}
      {/* ========================================================================= */}
      {simulatorMode === 'advanced' && (
        <div>
          {/* Quick Scenarios Bar */}
          <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900/30 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-400 font-medium">Scenarios:</span>
            {sampleScenarios.map((sc, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyScenario(sc)}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>{sc.title}</span>
              </button>
            ))}
          </div>

          {/* Standalone Discovery Section */}
          <div className="p-5 border-b border-slate-800/80 bg-slate-900/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-950/80 text-cyan-400 border border-cyan-800/50">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white tracking-wide uppercase">
                    Agent Merchant & Product Discovery
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Search live web vendors and products using Groq LLM and Tavily.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleDiscover} className="space-y-2.5">
              <textarea
                value={discoveryQuery}
                onChange={(e) => setDiscoveryQuery(e.target.value)}
                rows={2}
                placeholder="e.g. Find me cloud VPS hosting providers under 20 USD per month..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
              />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-slate-500" />
                  <span>Real-time web search via Tavily & Groq intent understanding</span>
                </div>

                <button
                  type="submit"
                  disabled={isSearching || !discoveryQuery.trim()}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs flex items-center gap-2 shadow-md disabled:opacity-50"
                >
                  {isSearching ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Searching & Discovering...</span>
                    </>
                  ) : (
                    <>
                      <Compass className="w-3.5 h-3.5" />
                      <span>Discover Merchants & Products</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {discoveryError && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Discovery Error: {discoveryError}</span>
              </div>
            )}

            {discoveryResults && discoveryResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {discoveryResults.map((product, idx) => {
                  const displayName = product.merchantName || product.merchantDomain || product.title;
                  const isSelected = selectedCandidate?.sourceUrl === product.sourceUrl;

                  return (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                        isSelected
                          ? 'bg-cyan-950/30 border-cyan-500/60 shadow-lg shadow-cyan-950/40'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h5 className="text-xs font-bold text-white truncate" title={displayName}>
                            {displayName}
                          </h5>
                          <a
                            href={product.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded text-slate-400 hover:text-cyan-300"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <p className="text-xs font-medium text-slate-200 line-clamp-2">{product.title}</p>
                        <p className="text-[11px] text-slate-400 line-clamp-3">{product.description}</p>
                        <div className="pt-2 flex items-center gap-1.5">
                          {product.unverifiedListedPrice !== null ? (
                            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-medium bg-amber-950/60 text-amber-300 border border-amber-800/50">
                              Unverified: {product.currency ? `${product.currency} ` : '$'}{product.unverifiedListedPrice}
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded font-mono text-slate-400 bg-slate-900 border border-slate-800">
                              Price not verified
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 mt-2 border-t border-slate-800/60">
                        <button
                          type="button"
                          onClick={() => handleSelectCandidate(product)}
                          className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
                            isSelected
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/80'
                              : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700/80'
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Selected for Policy Check</span>
                            </>
                          ) : (
                            <>
                              <span>Select for Guardrail Check</span>
                              <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Manual Form Area */}
          <div className="p-5">
            <form onSubmit={handleEvaluateAdvanced} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Autonomous Purchase Request Intent / Justification
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={2}
                  placeholder="e.g. Authorize monthly renewal for GitHub Copilot Team seat ($45/month)..."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:ring-1 focus:ring-cyan-500 focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Merchant / Payee *
                  </label>
                  <input
                    type="text"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    placeholder="e.g. GitHub Inc."
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Domain</label>
                  <input
                    type="text"
                    value={merchantDomain}
                    onChange={(e) => setMerchantDomain(e.target.value)}
                    placeholder="e.g. github.com"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Amount & Currency *</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="45.00"
                      required
                      className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                    />
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="px-2 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                      <option value="CAD">CAD</option>
                      <option value="AUD">AUD</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Budget Cap</label>
                  <input
                    type="text"
                    value={userBudgetLimit}
                    onChange={(e) => setUserBudgetLimit(e.target.value)}
                    placeholder="Optional (e.g. 50.00)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Agent ID *</label>
                  <input
                    type="text"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    placeholder="DevOps-Bot-01"
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <CornerDownLeft className="w-3.5 h-3.5 text-slate-500" />
                  <span>Calls authoritative backend: <code>POST /api/authorization/evaluate</code></span>
                </div>

                <button
                  type="submit"
                  disabled={isEvaluating}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                >
                  {isEvaluating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Evaluating via Backend Engine...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Evaluate Authorization</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {backendError && (
              <div className="mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Backend Error: {backendError}</span>
              </div>
            )}

            {/* Decision Result Box */}
            {lastDecision && (
              <div className="mt-5 p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    {lastDecision.status === 'APPROVED' && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                        <ShieldCheck className="w-4 h-4" />
                        <span>APPROVED</span>
                      </div>
                    )}
                    {lastDecision.status === 'REVIEW_REQUIRED' && (
                      <>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
                          <AlertTriangle className="w-4 h-4" />
                          <span>REVIEW REQUIRED</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => refreshDecisionStatus(lastDecision.decisionId)}
                          disabled={isRefreshingDecision}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/60 text-[11px] font-medium"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRefreshingDecision ? 'animate-spin' : ''}`} />
                          <span>{isRefreshingDecision ? 'Checking...' : 'Check Status'}</span>
                        </button>
                      </>
                    )}
                    {lastDecision.status === 'BLOCKED' && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold">
                        <ShieldAlert className="w-4 h-4" />
                        <span>BLOCKED</span>
                      </div>
                    )}

                    <div className="text-xs font-mono text-slate-400">
                      ID: <span className="text-slate-200 font-semibold">{lastDecision.decisionId}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">PayPal Order Gate:</span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                        lastDecision.canProceedToPayment
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {lastDecision.canProceedToPayment ? 'ELIGIBLE TO PROCEED' : 'PAYMENT PROHIBITED'}
                    </span>
                  </div>
                </div>

                {syncNotice && (
                  <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/60 text-cyan-200 text-xs flex items-center gap-2">
                    <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span>{syncNotice}</span>
                  </div>
                )}

                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                  <strong className="text-white block mb-0.5">Authoritative Policy Explanation:</strong>
                  {lastDecision.explanation}
                </div>

                {/* PayPal Checkout Gate */}
                {lastDecision.status === 'APPROVED' && lastDecision.canProceedToPayment && (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/50 to-slate-900 border border-blue-500/30 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-cyan-400" />
                          <h4 className="text-xs font-bold text-white tracking-wide">
                            PayPal Sandbox Orders API Gate
                          </h4>
                          <Badge variant="sandbox">Orders v2</Badge>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-1">
                          Pre-transaction verification passed. Initiate PayPal Sandbox order for{' '}
                          <strong>${lastDecision.purchaseIntent.amount.toFixed(2)} {lastDecision.purchaseIntent.currency}</strong>.
                        </p>
                      </div>

                      {!payPalOrderResult && (
                        <button
                          onClick={() => handleInitiatePayPalOrder(false)}
                          disabled={isCreatingPayPalOrder}
                          className="px-5 py-2.5 rounded-lg bg-[#0070BA] hover:bg-[#003087] text-white text-xs font-bold transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
                        >
                          {isCreatingPayPalOrder ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Creating Sandbox Order...</span>
                            </>
                          ) : (
                            <>
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Pay with PayPal Sandbox</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {payPalError && (
                      <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex justify-between items-center">
                        <span>PayPal Error: {payPalError}</span>
                        <button
                          type="button"
                          onClick={() => handleInitiatePayPalOrder(true)}
                          disabled={isCreatingPayPalOrder}
                          className="text-xs px-2.5 py-1 rounded bg-rose-900 text-white"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {payPalOrderResult && (
                      <div className="p-3 rounded-lg bg-slate-950 border border-emerald-500/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>PayPal Sandbox Order Created</span>
                          </div>
                          <span className="font-mono text-xs text-white">ID: {payPalOrderResult.orderId}</span>
                        </div>
                        <div className="pt-1 flex gap-2">
                          <a
                            href={payPalOrderResult.approvalUrl}
                            target="_self"
                            rel="noreferrer"
                            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-md"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Proceed to PayPal Sandbox Checkout</span>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
