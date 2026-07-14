import {
  FINANCIAL_STATUS_LABELS,
  FISCAL_STATUS_LABELS,
  INTEGRATION_STATUS_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  VEHICLE_STATUS_LABELS,
  platformLabel,
  type FinancialStatus,
  type FiscalStatus,
  type IntegrationStatus,
  type TicketPriority,
  type TicketStatus,
  type VehicleStatus,
} from '../types';

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  if (priority === 'NORMAL') return null; // reduz ruído: só destaca o fora do comum
  return (
    <span className={`badge priority-${priority}`} title={`Prioridade: ${PRIORITY_LABELS[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function PlatformBadge({ platform }: { platform: string }) {
  return <span className={`badge platform-badge platform-${platform}`}>{platformLabel(platform)}</span>;
}

export function StatusDot({ status }: { status: TicketStatus }) {
  return <span className={`dot status-dot-${status}`} title={STATUS_LABELS[status]} />;
}

export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  return (
    <span className={`badge integ-badge integ-${status}`}>
      <span className="integ-badge-dot" />
      {INTEGRATION_STATUS_LABELS[status]}
    </span>
  );
}

export function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  return <span className={`badge veh-status veh-${status}`}>{VEHICLE_STATUS_LABELS[status]}</span>;
}

export function FinancialStatusBadge({ status }: { status: FinancialStatus }) {
  return <span className={`badge fin-status fin-${status}`}>{FINANCIAL_STATUS_LABELS[status]}</span>;
}

export function FiscalStatusBadge({ status }: { status: FiscalStatus }) {
  return <span className={`badge fiscal-status fiscal-${status}`}>{FISCAL_STATUS_LABELS[status]}</span>;
}
