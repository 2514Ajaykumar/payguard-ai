import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  RefreshCw, 
  ArrowLeft 
} from 'lucide-react';
import { capturePaymentOrder, cancelPaymentOrder } from '../../services/api';
import { CaptureOrderResult } from '../../types';

interface PaymentReturnViewProps {
  mode: 'success' | 'cancel';
  onReturnToDashboard: () => void;
}

export const PaymentReturnView: React.FC<PaymentReturnViewProps> = ({
  mode,
  onReturnToDashboard,
}) => {
  const [isProcessing, setIsProcessing] = useState(mode === 'success');
  const [captureResult, setCaptureResult] = useState<CaptureOrderResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || '';
    setOrderId(token);

    if (mode === 'success') {
      if (!token) {
        setIsProcessing(false);
        setErrorMessage('Missing PayPal Order token in URL redirect parameters.');
        return;
      }

      // Execute authoritative server-side capture
      const processCapture = async () => {
        setIsProcessing(true);
        setErrorMessage(null);

        const result = await capturePaymentOrder(token);
        setIsProcessing(false);

        if (result.success && result.data) {
          setCaptureResult(result.data);
        } else {
          setErrorMessage(result.error || 'Server-side capture failed or order was not approved.');
        }
      };

      processCapture();
    } else if (mode === 'cancel') {
      setIsProcessing(false);
      if (token) {
        cancelPaymentOrder(token).catch(() => {});
      }
    }
  }, [mode]);

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 animate-fadeIn">
      {/* SUCCESS / CAPTURE VIEW */}
      {mode === 'success' && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8">
          {isProcessing ? (
            <div className="text-center py-10 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-cyan-950/60 border border-cyan-800 flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              </div>
              <h3 className="text-lg font-bold text-white">
                Finalizing PayPal Sandbox Capture...
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Executing authoritative server-side capture for Order ID: <code className="text-cyan-300 font-mono">{orderId}</code>. Verifying decision gates before settlement.
              </p>
            </div>
          ) : captureResult ? (
            <div className="space-y-6">
              {captureResult.status === 'RECONCILIATION_REQUIRED' ? (
                /* Reconciliation Required Banner */
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <AlertTriangle className="w-9 h-9" />
                  </div>
                  <div className="inline-block px-2.5 py-0.5 rounded-full bg-amber-950 border border-amber-800/60 text-amber-300 text-[11px] font-mono uppercase tracking-wider font-semibold">
                    PayPal Sandbox &bull; Reconciliation Required
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    Settlement Discrepancy Detected
                  </h3>
                  <p className="text-xs text-amber-200/80 max-w-md mx-auto leading-relaxed">
                    Funds were captured on PayPal, but the captured amount or currency differed from the pre-authorized decision. Settlement evidence is preserved for administrative review.
                  </p>
                </div>
              ) : (
                /* Header Badge - Verified Capture */
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <div className="inline-block px-2.5 py-0.5 rounded-full bg-cyan-950 border border-cyan-800/60 text-cyan-300 text-[11px] font-mono uppercase tracking-wider font-semibold">
                    PayPal Sandbox &bull; Verified Capture
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    Payment Captured Successfully
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    PayGuard pre-transaction guardrail passed and server-side capture executed against PayPal Orders API v2.
                  </p>
                </div>
              )}

              {/* Settlement Receipt Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                {captureResult.status === 'RECONCILIATION_REQUIRED' && captureResult.settlementMismatch && (
                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs space-y-1 font-sans">
                    <div className="font-semibold text-amber-300">Discrepancy Details:</div>
                    <p className="text-[11px] leading-relaxed">{captureResult.settlementMismatch.reason}</p>
                    <div className="flex gap-4 pt-1 font-mono text-[11px]">
                      <span>Expected: ${captureResult.settlementMismatch.expectedAmount.toFixed(2)} {captureResult.settlementMismatch.expectedCurrency}</span>
                      <span>Captured: {captureResult.settlementMismatch.capturedAmount !== undefined ? `$${captureResult.settlementMismatch.capturedAmount.toFixed(2)}` : 'MISSING'} {captureResult.settlementMismatch.capturedCurrency || 'MISSING'}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 font-mono">
                  <span className="text-slate-400">Captured Amount:</span>
                  <span className={`font-bold text-base ${captureResult.status === 'RECONCILIATION_REQUIRED' ? 'text-amber-400' : 'text-emerald-400'}`}>
                    ${isNaN(captureResult.amount) ? '0.00' : captureResult.amount.toFixed(2)} {captureResult.currency}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span className="text-slate-400 block text-[11px]">PayPal Order ID:</span>
                    <span className="text-white select-all">{captureResult.orderId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">PayPal Capture ID:</span>
                    <span className="text-cyan-300 select-all font-semibold">{captureResult.captureId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">PayGuard Decision ID:</span>
                    <span className="text-white">{captureResult.decisionId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Buyer Payer ID:</span>
                    <span className="text-slate-300">{captureResult.payerId || 'Sandbox Payer'}</span>
                  </div>
                </div>

                {captureResult.payerEmail && (
                  <div className="pt-2 border-t border-slate-800/80 flex justify-between font-mono text-[11px]">
                    <span className="text-slate-400">Payer Account:</span>
                    <span className="text-slate-300">{captureResult.payerEmail}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-center pt-2">
                <button
                  onClick={onReturnToDashboard}
                  className="px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center gap-2 transition-all shadow-lg shadow-cyan-900/30"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Return to PayGuard Dashboard</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <XCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">Payment Capture Failed</h3>
              <p className="text-xs text-rose-300 max-w-md mx-auto leading-relaxed p-3 rounded bg-rose-950/30 border border-rose-900">
                {errorMessage || 'Unknown server error during capture.'}
              </p>
              <div className="flex justify-center pt-3">
                <button
                  onClick={onReturnToDashboard}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-all flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Dashboard</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CANCELLATION VIEW */}
      {mode === 'cancel' && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">
            PayPal Checkout Cancelled
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            The buyer closed or cancelled the PayPal Sandbox checkout window. No funds were captured.
          </p>
          {orderId && (
            <div className="inline-block p-2 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400">
              Cancelled Order ID: <span className="text-white">{orderId}</span>
            </div>
          )}
          <div className="flex justify-center pt-3">
            <button
              onClick={onReturnToDashboard}
              className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-all flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Dashboard</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
