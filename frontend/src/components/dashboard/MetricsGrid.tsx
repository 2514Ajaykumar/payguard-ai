import React from 'react';
import { ShieldAlert, ShieldCheck, Clock, Layers } from 'lucide-react';
import { MetricCard } from './MetricCard';
import { DashboardMetrics } from '../../types';

interface MetricsGridProps {
  metrics: DashboardMetrics;
  isEmptyState?: boolean;
}

export const MetricsGrid: React.FC<MetricsGridProps> = ({
  metrics,
  isEmptyState = false,
}) => {
  if (isEmptyState) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Evaluated Requests"
          value="0"
          subtitle="Awaiting agent transactions"
          icon={Layers}
          variant="default"
        />
        <MetricCard
          title="Approved Requests"
          value="0"
          subtitle="Pre-transaction verified"
          icon={ShieldCheck}
          variant="approved"
        />
        <MetricCard
          title="Pending Approvals"
          value="0"
          subtitle="Human review queue"
          icon={Clock}
          variant="review"
        />
        <MetricCard
          title="Blocked Requests"
          value="0"
          subtitle="Risks intercepted"
          icon={ShieldAlert}
          variant="blocked"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Evaluated Requests"
        value={metrics.evaluatedCount}
        subtitle="Total autonomous intents inspected"
        change="+18.4% this week"
        changeType="positive"
        icon={Layers}
        variant="default"
      />
      <MetricCard
        title="Approved Requests"
        value={metrics.approvedCount}
        subtitle={`${metrics.approvalRate}% autonomous pass rate`}
        change="Compliant"
        changeType="positive"
        icon={ShieldCheck}
        variant="approved"
      />
      <MetricCard
        title="Pending Approvals"
        value={metrics.pendingCount}
        subtitle="Requires supervisor authorization"
        change="Needs action"
        changeType="neutral"
        icon={Clock}
        variant="review"
      />
      <MetricCard
        title="Blocked Requests"
        value={metrics.blockedCount}
        subtitle={`${metrics.blockedRate}% policy violation rate`}
        change="Threats neutralized"
        changeType="negative"
        icon={ShieldAlert}
        variant="blocked"
      />
    </div>
  );
};
