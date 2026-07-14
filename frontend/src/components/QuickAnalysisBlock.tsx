import { useState } from 'react';
import { vehiclesApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { formatDocumentInput } from '../utils/format';
import { QuickCreditModal } from './QuickCreditModal';
import { CarIcon, SearchDataIcon, ShieldIcon } from './icons';

interface PlatePreview {
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  yearModel?: number | null;
  color?: string | null;
  fuel?: string | null;
  km?: number | null;
  fipePrice?: number | null;
}

/**
 * Ações rápidas de análise na lateral do chat: consulta de score por CPF/CNPJ
 * (abre pop-up) e "puxar dados" de um carro na troca pela placa — tudo sem sair
 * da conversa.
 */
export function QuickAnalysisBlock({ leadDocument }: { leadDocument: string | null }) {
  const [doc, setDoc] = useState(leadDocument ? formatDocumentInput(leadDocument) : '');
  const [creditOpen, setCreditOpen] = useState(false);

  const [plate, setPlate] = useState('');
  const [plateLoading, setPlateLoading] = useState(false);
  const [plateData, setPlateData] = useState<PlatePreview | null>(null);
  const [plateError, setPlateError] = useState<string | null>(null);

  const consultScore = () => {
    const digits = doc.replace(/\D/g, '');
    if (digits.length === 11 || digits.length === 14) setCreditOpen(true);
  };

  const pullPlate = async () => {
    if (!plate.trim()) return;
    setPlateLoading(true);
    setPlateError(null);
    try {
      const res = await vehiclesApi.plateLookup(plate);
      setPlateData(res.data);
    } catch (err) {
      setPlateError(err instanceof ApiError ? err.message : 'Falha ao consultar a placa');
      setPlateData(null);
    } finally {
      setPlateLoading(false);
    }
  };

  const docReady = doc.replace(/\D/g, '').length === 11 || doc.replace(/\D/g, '').length === 14;

  return (
    <details open className="side-sec quick-analysis">
      <summary>Ações rápidas de análise</summary>

      {/* CPF/CNPJ → Score */}
      <div className="quick-field">
        <label className="quick-field-label">
          <ShieldIcon size={13} /> CPF / CNPJ do cliente
        </label>
        <div className="quick-input-row">
          <input
            value={doc}
            onChange={(e) => setDoc(formatDocumentInput(e.target.value))}
            placeholder="000.000.000-00"
            inputMode="numeric"
          />
          <button className="btn btn-primary btn-sm" onClick={consultScore} disabled={!docReady}>
            Consultar Score
          </button>
        </div>
      </div>

      {/* Placa → ficha preliminar */}
      <div className="quick-field">
        <label className="quick-field-label">
          <CarIcon size={13} /> Placa do carro na troca
        </label>
        <div className="quick-input-row">
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="ABC1D23"
            maxLength={8}
            className="plate-mini"
          />
          <button className="btn btn-ghost btn-sm" onClick={pullPlate} disabled={plateLoading || !plate.trim()}>
            <SearchDataIcon size={13} /> {plateLoading ? '…' : 'Puxar Dados'}
          </button>
        </div>
        {plateError && <p className="form-error small">{plateError}</p>}
        {plateData && (
          <div className="plate-preview">
            <div className="plate-preview-title">
              {plateData.brand} {plateData.model} {plateData.version}
            </div>
            <div className="plate-preview-grid">
              {plateData.yearModel && <span>Ano {plateData.yearModel}</span>}
              {plateData.color && <span>{plateData.color}</span>}
              {plateData.fuel && <span>{plateData.fuel}</span>}
              {plateData.km != null && <span>{plateData.km.toLocaleString('pt-BR')} km</span>}
            </div>
            {plateData.fipePrice != null && (
              <div className="plate-preview-fipe">
                FIPE: <strong>{plateData.fipePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
              </div>
            )}
            <p className="muted small">Dados preliminares (simulação da consulta de placa).</p>
          </div>
        )}
      </div>

      {creditOpen && <QuickCreditModal document={doc} onClose={() => setCreditOpen(false)} />}
    </details>
  );
}
