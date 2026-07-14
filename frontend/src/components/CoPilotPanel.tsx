import { useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { ticketsApi } from '../api/endpoints';
import type { Interaction, TicketDetail } from '../types';
import { CoinsIcon, LinkIcon, SendIcon, SparklesIcon } from './icons';

interface Props {
  ticket: TicketDetail;
  onUpdated: (detail: TicketDetail) => void;
}

interface AiAction {
  id: string;
  label: string;
  icon: JSX.Element;
  time: string;
  alert?: boolean;
}

const shortTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Deriva o feed de ações da IA a partir da linha do tempo do ticket. */
function buildActions(interactions: Interaction[]): AiAction[] {
  const out: AiAction[] = [];
  for (const i of interactions) {
    const meta = i.metadata ?? {};
    const time = shortTime(i.createdAt);
    if (i.type === 'AGENT_REPLY' && meta.ai === true) {
      out.push({ id: i.id, label: 'Respondeu ao cliente', icon: <SendIcon size={13} />, time });
    } else if (meta.kind === 'ai') {
      if (meta.event === 'credit') {
        out.push({ id: i.id, label: 'Consulta de Crédito', icon: <CoinsIcon size={13} />, time });
      } else if (meta.event === 'handoff') {
        out.push({ id: i.id, label: 'Transferiu o chat para o Humano', icon: <LinkIcon size={13} />, time, alert: true });
      } else if (meta.event === 'toggle') {
        out.push({
          id: i.id,
          label: meta.enabled ? 'Atendimento por IA ativado' : 'Atendimento por IA desligado',
          icon: <SparklesIcon size={13} />,
          time,
        });
      }
    }
  }
  return out.reverse().slice(0, 6);
}

export function CoPilotPanel({ ticket, onUpdated }: Props) {
  const [saving, setSaving] = useState(false);
  const active = ticket.botEnabled;
  const actions = useMemo(() => buildActions(ticket.interactions), [ticket.interactions]);

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    try {
      onUpdated(await ticketsApi.setBot(ticket.id, !active));
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Não foi possível alterar o modo de atendimento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`copilot ${active ? 'on' : ''}`}>
      <div className="copilot-head">
        <span className="copilot-icon">
          <SparklesIcon size={16} />
        </span>
        <div className="copilot-title">
          <strong>Automação · Co-Piloto</strong>
          <span className="copilot-sub">Atendimento por IA</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label="Ativar atendimento por IA"
          className={`copilot-switch ${active ? 'on' : ''}`}
          disabled={saving}
          onClick={() => void toggle()}
        >
          <span className="copilot-knob" />
        </button>
      </div>

      <div className="copilot-status">
        {active ? (
          <span className="copilot-badge running">
            <span className="copilot-pulse" /> Em Execução
          </span>
        ) : (
          <span className="copilot-badge idle">Interrompido · Humano</span>
        )}
        <span className="copilot-status-hint">
          {active ? 'A IA responde os novos contatos deste lead.' : 'Você está no controle desta conversa.'}
        </span>
      </div>

      <div className="copilot-log">
        <div className="copilot-log-title">Log de ações da IA</div>
        {actions.length === 0 ? (
          <p className="copilot-log-empty">Nenhuma ação automática ainda.</p>
        ) : (
          <ul className="copilot-log-list">
            {actions.map((a) => (
              <li key={a.id} className={`copilot-log-item ${a.alert ? 'alert' : ''}`}>
                <span className="copilot-log-icon">{a.icon}</span>
                <span className="copilot-log-label">
                  IA executou: <strong>{a.label}</strong>
                </span>
                <span className="copilot-log-time">{a.time}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
