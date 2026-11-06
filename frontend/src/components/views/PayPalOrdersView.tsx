import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  AlertTriangle, 
  Receipt
} from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { fetchPayments } from '../../services/api';
import { PaymentRecord, PaymentStatus } from '../../types';

export const PayPalOrdersView: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPayments = async () => {
    setIsLoading(true);
    setError(null);
    const res = await fetchPayments();
    setIsLoading(false);

    if (res.success) {
      setPayments(res.data);
    } else {
      setError(res.error || 'Failed to fetch payment records');
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const getStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge variant="approved" dot>Captured</Badge>;
      case 'CREATED':
        return <Badge variant="sandbox" dot>Order Created</Badge>;
      case 'APPROVED_BY_BUYER':
        return <Badge variant="review" dot>Buyer Approved</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral">Cancelled</Badge>;
      case 'FAILED':
        return <Badge variant="blocked" dot>Failed</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              PayPal Orders & Captures Audit Trail
            </h2>
            <Badge variant="sandbox">Orders API v2</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative PayPal Sandbox orders, capture records, and settlement lifecycle.
          </p>
        </div>

        <button
          onClick={loadPayments}
          disabled={isLoading}
          className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Records</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Orders List */}
      {payments.length === 0 ? (
        <Card className="text-center py-10">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
            <Receipt className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-white">No PayPal Sandbox Orders Yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-3">
            Initiate an order from an approved intent in the simulator to see PayPal Orders API transactions here.
          </p>
        </Card>
      ) : (
        <div className="rounded-xl bg-background-surface border border-slate-800 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Payment ID / Decision</th>
                  <th className="py-3 px-4">PayPal Order ID</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Capture Status</th>
                  <th className="py-3 px-4">PayPal Capture ID</th>
                  <th className="py-3 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200 font-mono">
                {payments.map((p) => (
                  <tr key={p.paymentId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{p.paymentId}</div>
                      <div className="text-[11px] text-slate-400 font-sans">{p.decisionId}</div>
                    </td>
                    <td className="py-3.5 px-4 text-cyan-300">
                      {p.paypalOrderId}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-white">
                      ${p.amount.toFixed(2)} {p.currency}
                    </td>
                    <td className="py-3.5 px-4 font-sans">
                      {getStatusBadge(p.status)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {p.paypalCaptureId || (
                        <span className="text-slate-500 font-sans italic text-[11px]">Not captured</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-400 text-[11px]">
                      {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
