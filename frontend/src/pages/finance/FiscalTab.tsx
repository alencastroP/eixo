import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { fiscalApi, vehiclesApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { FiscalStatusBadge } from '../../components/badges';
import { DownloadIcon, FileTextIcon, ReceiptIcon } from '../../components/icons';
import {
  FISCAL_KIND_LABELS,
  type FiscalInvoice,
  type FiscalKind,
  type VehicleCard,
  type VehicleDetail,
} from '../../types';
import { formatBRL, formatDateTime } from '../../utils/format';

/** Tipos de nota disponíveis, com descrição e se envolvem veículo. */
const NOTE_TYPES: Array<{ kind: FiscalKind; title: string; desc: string; group: 'NFE' | 'NFSE' }> = [
  { kind: 'NFE_ENTRY', title: 'Nota de Entrada', desc: 'Compra de veículo de Pessoa Física', group: 'NFE' },
  { kind: 'NFE_EXIT', title: 'Nota de Saída', desc: 'Venda definitiva do veículo', group: 'NFE' },
  { kind: 'NFE_RETURN', title: 'Nota de Devolução', desc: 'Retirada de veículo consignado', group: 'NFE' },
  { kind: 'NFSE', title: 'NFS-e (Serviço)', desc: 'Comissão de intermediação ou oficina', group: 'NFSE' },
];

const ICMS_RATE = 0.12;
const ISS_RATE = 0.05;

/** Prévia do imposto no cliente (o backend recalcula de forma autoritativa na emissão). */
function previewTax(kind: FiscalKind, operationValue: number, costPrice: number) {
  if (kind === 'NFE_EXIT') {
    const base = Math.max(0, operationValue - costPrice);
    return { base, rate: ICMS_RATE, tax: base * ICMS_RATE, label: 'ICMS sobre a margem (venda − compra)' };
  }
  if (kind === 'NFSE') {
    return { base: operationValue, rate: ISS_RATE, tax: operationValue * ISS_RATE, label: 'ISS sobre o serviço' };
  }
  if (kind === 'NFE_ENTRY') {
    return { base: 0, rate: 0, tax: 0, label: 'Entrada de PF — sem incidência de ICMS' };
  }
  return { base: 0, rate: 0, tax: 0, label: 'Devolução — sem incidência de ICMS' };
}

export function FiscalTab() {
  const [kind, setKind] = useState<FiscalKind>('NFE_EXIT');
  const [vehicles, setVehicles] = useState<VehicleCard[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [vehicleDetail, setVehicleDetail] = useState<VehicleDetail | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [recipientDoc, setRecipientDoc] = useState('');
  const [operationValue, setOperationValue] = useState('');
  const [invoices, setInvoices] = useState<FiscalInvoice[]>([]);
  const [emitting, setEmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<FiscalInvoice | null>(null);

  const isVehicleNote = kind !== 'NFSE';

  useEffect(() => {
    vehiclesApi
      .list({ pageSize: 60 })
      .then((r) => setVehicles(r.items))
      .catch(() => setVehicles([]));
    loadInvoices();
  }, []);

  const loadInvoices = () => {
    fiscalApi
      .invoices()
      .then(setInvoices)
      .catch(() => setInvoices([]));
  };

  // ao escolher veículo, busca detalhe (para custo → margem) e pré-preenche o valor
  useEffect(() => {
    if (!vehicleId) {
      setVehicleDetail(null);
      return;
    }
    vehiclesApi.get(vehicleId).then((v) => {
      setVehicleDetail(v);
      if (kind === 'NFE_EXIT' && v.salePrice) setOperationValue(String(v.salePrice));
      else if (kind === 'NFE_ENTRY' && v.costPrice) setOperationValue(String(v.costPrice));
    });
  }, [vehicleId, kind]);

  const costPrice = vehicleDetail?.costPrice ?? 0;
  const opValue = Number(operationValue) || 0;
  const tax = useMemo(() => previewTax(kind, opValue, costPrice), [kind, opValue, costPrice]);

  const emit = async (e: FormEvent) => {
    e.preventDefault();
    if (isVehicleNote && !vehicleId) {
      setError('Selecione um veículo do estoque.');
      return;
    }
    if (!recipientName.trim() || opValue <= 0) {
      setError('Informe o destinatário e o valor da operação.');
      return;
    }
    setEmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const inv = await fiscalApi.emit({
        kind,
        vehicleId: isVehicleNote ? vehicleId : null,
        recipientName,
        recipientDoc: recipientDoc || null,
        operationValue: opValue,
      });
      setSuccess(inv);
      setInvoices((prev) => [inv, ...prev]);
      // limpa parcialmente
      setRecipientName('');
      setRecipientDoc('');
      setOperationValue('');
      setVehicleId('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha na emissão');
    } finally {
      setEmitting(false);
    }
  };

  const downloadXml = (inv: FiscalInvoice) => {
    if (!inv.xml) return;
    const blob = new Blob([inv.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nfe-${inv.number}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fiscal">
      <div className="fiscal-layout">
        {/* ── Formulário de emissão ── */}
        <section className="panel emit-panel">
          <div className="panel-header">
            <h2>Emitir Nota Fiscal</h2>
            <ReceiptIcon size={17} />
          </div>

          <form onSubmit={emit}>
            <span className="field-label">Tipo de nota</span>
            <div className="note-types">
              {NOTE_TYPES.map((n) => (
                <button
                  type="button"
                  key={n.kind}
                  className={`note-type ${kind === n.kind ? 'active' : ''}`}
                  onClick={() => setKind(n.kind)}
                >
                  <span className="note-type-badge">{n.group === 'NFE' ? 'NF-e' : 'NFS-e'}</span>
                  <span className="note-type-title">{n.title}</span>
                  <span className="note-type-desc">{n.desc}</span>
                </button>
              ))}
            </div>

            {isVehicleNote && (
              <label className="field">
                <span>Veículo do estoque *</span>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.brand} {v.model} {v.version ?? ''} · {v.yearModel}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="field-row">
              <label className="field">
                <span>Destinatário *</span>
                <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Nome / Razão social" />
              </label>
              <label className="field">
                <span>CPF/CNPJ do destinatário</span>
                <input value={recipientDoc} onChange={(e) => setRecipientDoc(e.target.value)} placeholder="Somente números" />
              </label>
            </div>

            <label className="field">
              <span>Valor da operação (R$) *</span>
              <input type="number" min="0" step="0.01" value={operationValue} onChange={(e) => setOperationValue(e.target.value)} />
            </label>

            {/* Resumo do imposto */}
            <div className="tax-summary">
              <div className="tax-summary-head">Resumo tributário</div>
              <div className="tax-row">
                <span>Valor da operação</span>
                <strong>{formatBRL(opValue)}</strong>
              </div>
              {kind === 'NFE_EXIT' && (
                <div className="tax-row muted">
                  <span>Preço de compra do veículo</span>
                  <span>− {formatBRL(costPrice)}</span>
                </div>
              )}
              <div className="tax-row">
                <span>Base de cálculo</span>
                <strong>{formatBRL(tax.base)}</strong>
              </div>
              <div className="tax-row tax-row-total">
                <span>Imposto ({(tax.rate * 100).toFixed(0)}%)</span>
                <strong className="tax-value">{formatBRL(tax.tax)}</strong>
              </div>
              <p className="tax-note">{tax.label}</p>
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && (
              <div className={`alert ${success.status === 'AUTHORIZED' ? 'alert-success' : 'alert-error'}`}>
                {success.status === 'AUTHORIZED'
                  ? `Nota #${success.number} autorizada pela SEFAZ.`
                  : `Nota #${success.number} ${success.status === 'REJECTED' ? 'rejeitada' : success.status}. ${success.rejectReason ?? ''}`}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-block emit-btn" disabled={emitting}>
              <FileTextIcon size={16} /> {emitting ? 'Emitindo…' : 'Emitir Nota'}
            </button>
          </form>
        </section>

        {/* ── Histórico ── */}
        <section className="panel history-panel">
          <div className="panel-header">
            <h2>Histórico de Notas</h2>
            <span className="muted small">{invoices.length} emitidas</span>
          </div>

          <div className="invoice-list">
            {invoices.length === 0 && <p className="muted small">Nenhuma nota emitida ainda.</p>}
            {invoices.map((inv) => (
              <div key={inv.id} className="invoice-item">
                <div className="invoice-top">
                  <span className="invoice-number">#{inv.number}</span>
                  <span className="invoice-kind">{FISCAL_KIND_LABELS[inv.kind]}</span>
                  <FiscalStatusBadge status={inv.status} />
                </div>
                <div className="invoice-recipient">{inv.recipientName}</div>
                {inv.vehicle && <div className="invoice-vehicle muted small">{inv.vehicle.brand} {inv.vehicle.model}</div>}
                <div className="invoice-values">
                  <span>{formatBRL(inv.operationValue)}</span>
                  <span className="muted">imposto {formatBRL(inv.taxAmount)}</span>
                </div>
                {inv.accessKey && <div className="invoice-key mono">{inv.accessKey}</div>}
                <div className="invoice-foot">
                  <span className="muted small">{formatDateTime(inv.issuedAt)}</span>
                  {inv.xml && (
                    <button className="link-btn" onClick={() => downloadXml(inv)}>
                      <DownloadIcon size={13} /> XML
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
