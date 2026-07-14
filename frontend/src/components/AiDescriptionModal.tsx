import { useState } from 'react';
import { vehiclesApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { SparklesIcon } from './icons';

interface Props {
  vehicleId: string;
  collected: string; // resumo dos dados já coletados (marca, modelo, etc.)
  onClose: () => void;
  onGenerated: (description: string) => void;
}

/**
 * Co-piloto de descrição: pergunta se o vendedor quer adicionar detalhes, junta
 * com os dados estruturados do veículo e gera um texto de anúncio persuasivo.
 */
export function AiDescriptionModal({ vehicleId, collected, onClose, onGenerated }: Props) {
  const [extra, setExtra] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const { description } = await vehiclesApi.generateDescription(vehicleId, extra || undefined);
      setResult(description);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao gerar a descrição');
    } finally {
      setLoading(false);
    }
  };

  const use = () => {
    if (result) onGenerated(result);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="ai-modal-title">
            <SparklesIcon size={18} /> Gerar Descrição com IA
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="ai-collected">
            <SparklesIcon size={15} />
            <span>
              Já coletamos os dados de <strong>{collected}</strong> do veículo para a IA. Deseja adicionar alguma
              informação ou detalhe adicional para o anúncio?
            </span>
          </div>

          <label className="field">
            <span>Detalhes adicionais (opcional)</span>
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={2}
              placeholder="Ex: Carro de único dono, revisado na concessionária, sem detalhes na pintura."
            />
          </label>

          {error && <div className="alert alert-error">{error}</div>}

          {result !== null && (
            <label className="field">
              <span>Descrição gerada (edite se quiser)</span>
              <textarea className="ai-result" value={result} onChange={(e) => setResult(e.target.value)} rows={10} />
            </label>
          )}

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            {result === null ? (
              <button className="btn btn-primary" onClick={generate} disabled={loading}>
                <SparklesIcon size={15} /> {loading ? 'Gerando…' : 'Gerar descrição'}
              </button>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={generate} disabled={loading}>
                  {loading ? '…' : 'Gerar novamente'}
                </button>
                <button className="btn btn-primary" onClick={use}>
                  Usar esta descrição
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
