import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { channelsApi } from '../api/endpoints';
import { CheckIcon, PlugIcon, RefreshIcon } from './icons';
import { PlatformLogo } from './PlatformLogo';
import type { ChannelPlatform, ChannelSender, UserChannel } from '../types';

/**
 * "Canais de atendimento" em Meus Dados - onde o atendente conecta o número
 * pelo qual ELE fala com o cliente.
 *
 * A conta da plataforma (a WABA do WhatsApp, com o token) é da loja e o admin a
 * conecta em Integrações. Aqui só se escolhe, entre os números que a loja já
 * provisionou, qual é o seu - por isso a tela nunca pede credencial: se pedisse,
 * cada atendente teria uma cópia do token da loja.
 *
 * Fica FORA do <form> do perfil de propósito: os botões daqui não podem
 * disparar o submit de "Salvar alterações".
 */
export function ChannelsCard() {
  const [platforms, setPlatforms] = useState<ChannelPlatform[]>([]);
  const [mine, setMine] = useState<UserChannel[]>([]);
  const [loading, setLoading] = useState(true);

  /** Plataforma cuja lista de números está aberta (null = nenhuma). */
  const [picking, setPicking] = useState<string | null>(null);
  const [senders, setSenders] = useState<ChannelSender[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([channelsApi.platforms(), channelsApi.mine()])
      .then(([p, m]) => {
        setPlatforms(p);
        setMine(m);
      })
      .catch(() => setPlatforms([]))
      .finally(() => setLoading(false));
  }, []);

  const connectedOn = (platform: string) => mine.find((c) => c.platform === platform) ?? null;

  const openPicker = async (platform: string) => {
    setPicking(platform);
    setError(null);
    setLoadingSenders(true);
    setSenders([]);
    try {
      setSenders(await channelsApi.senders(platform));
    } catch (err) {
      // A causa mais comum é a loja ainda não ter conectado a plataforma - o
      // backend já devolve essa explicação pronta, com o caminho da tela.
      setError(err instanceof ApiError ? err.message : 'Falha ao consultar os números disponíveis');
    } finally {
      setLoadingSenders(false);
    }
  };

  const connect = async (platform: string, externalId: string) => {
    setBusy(true);
    setError(null);
    try {
      const channel = await channelsApi.connect(platform, externalId);
      setMine((prev) => [...prev.filter((c) => c.platform !== platform), channel]);
      setPicking(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao conectar o número');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (platform: string) => {
    setBusy(true);
    setError(null);
    try {
      await channelsApi.disconnect(platform);
      setMine((prev) => prev.filter((c) => c.platform !== platform));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao desconectar');
    } finally {
      setBusy(false);
    }
  };

  // Nenhuma plataforma do sistema oferece canal por atendente: some a seção
  // inteira em vez de mostrar um card vazio.
  if (!loading && platforms.length === 0) return null;

  return (
    <div className="settings-card">
      <div className="settings-section">
        <h3>Canais de atendimento</h3>
        <p className="muted small">
          Conecte o número pelo qual você fala com o cliente. Suas respostas nos tickets sairão por ele; sem um número
          conectado, elas saem pelo número padrão da loja.
        </p>

        {loading && <p className="muted small">Carregando…</p>}

        {platforms.map((p) => {
          const channel = connectedOn(p.platform);
          return (
            <div key={p.platform} className="channel-row">
              <div className="channel-row-main">
                <PlatformLogo platform={p.platform} size={38} />
                <div className="channel-row-info">
                  <span className="channel-row-name">{p.displayName}</span>
                  {channel ? (
                    <span className="channel-row-sub connected">
                      <CheckIcon size={13} /> {channel.displayNumber}
                      {channel.verifiedName ? ` · ${channel.verifiedName}` : ''}
                    </span>
                  ) : (
                    <span className="channel-row-sub muted">Nenhum número conectado</span>
                  )}
                </div>
              </div>

              {channel ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void disconnect(p.platform)}
                  disabled={busy}
                >
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void openPicker(p.platform)}
                  disabled={busy}
                >
                  <PlugIcon size={14} /> Conectar número
                </button>
              )}
            </div>
          );
        })}

        {picking && (
          <div className="channel-picker">
            <div className="channel-picker-head">
              <strong>Escolha o seu número</strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void openPicker(picking)}
                disabled={loadingSenders}
              >
                <RefreshIcon size={13} /> Atualizar
              </button>
            </div>

            {loadingSenders && <p className="muted small">Consultando os números da loja…</p>}

            {!loadingSenders && senders.length === 0 && !error && (
              <p className="muted small">
                Nenhum número provisionado nesta plataforma. Os números são cadastrados no painel da plataforma pela
                loja.
              </p>
            )}

            {senders.map((s) => (
              <div key={s.externalId} className={`channel-option ${s.takenBy ? 'taken' : ''}`}>
                <div className="channel-option-info">
                  <span className="channel-option-number">{s.displayNumber}</span>
                  {s.verifiedName && <span className="channel-option-name">{s.verifiedName}</span>}
                  {s.takenBy && <span className="channel-option-taken">Em uso por {s.takenBy}</span>}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void connect(picking, s.externalId)}
                  disabled={busy || Boolean(s.takenBy)}
                >
                  {s.takenBy ? 'Indisponível' : 'Usar este'}
                </button>
              </div>
            ))}

            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking(null)}>
              Cancelar
            </button>
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}
      </div>
    </div>
  );
}
