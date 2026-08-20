import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { SiteError, siteApi } from './api';
import { whatsappLink } from './components';
import { CloseIcon, MessageIcon, SendIcon, WhatsAppIcon } from './icons';

/**
 * Mensageiro de atendimento da vitrine.
 *
 * Do lado de fora é o widget de chat que todo visitante reconhece: launcher
 * redondo, painel flutuante, bolhas e respostas sugeridas. Por dentro, cada
 * conversa é um TICKET real do CRM — a primeira mensagem passa por
 * `ingestNormalizedLead` (a mesma porta dos leads de OLX/ML) e é respondida
 * pelo Agente de Pré-Venda IA. O atendente acompanha pela Caixa de Entrada e
 * assume quando quiser; nesse momento a API devolve `handedOff` e o widget
 * passa a empurrar a conversa para o WhatsApp.
 *
 * Sem ANTHROPIC_API_KEY a API responde `aiEnabled: false`: o lead continua
 * sendo registrado e avisamos que a resposta virá da equipe.
 */

interface Msg {
  role: 'bot' | 'user' | 'sys';
  text: string;
  at: number;
}

const tokenKey = (slug: string) => `eixo.chat.${slug}`;

const clock = (at: number) => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function AiChatWidget({
  slug,
  storeName,
  whatsapp,
  logoUrl,
  vehicleId,
  open,
  onOpenChange,
}: {
  slug: string;
  storeName: string;
  whatsapp: string;
  logoUrl: string | null;
  vehicleId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>(() => [
    {
      role: 'bot',
      at: Date.now(),
      text: `Oi! 👋 Sou o assistente da ${storeName}. Posso falar sobre os veículos do estoque, valores, troca e financiamento.`,
    },
  ]);
  const [identified, setIdentified] = useState(() => Boolean(sessionStorage.getItem(tokenKey(slug))));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [handedOff, setHandedOff] = useState(false);
  const [unread, setUnread] = useState(0);

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const quickReplies = useMemo(
    () =>
      vehicleId
        ? ['Esse veículo ainda está disponível?', 'Aceitam meu carro na troca?', 'Qual a parcela?']
        : ['Quais carros vocês têm até R$ 60 mil?', 'Aceitam troca?', 'Como funciona o financiamento?'],
    [vehicleId],
  );

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, open]);

  useEffect(() => {
    if (!open) return;
    setUnread(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(timer);
  }, [open]);

  // Esc fecha, como em qualquer painel sobreposto
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onOpenChange(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const push = (msg: Omit<Msg, 'at'>) => setMessages((list) => [...list, { ...msg, at: Date.now() }]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;

    if (!identified && (name.trim().length < 2 || phone.replace(/\D/g, '').length < 10)) {
      push({ role: 'sys', text: 'Preencha nome e WhatsApp acima para eu poder te responder.' });
      return;
    }

    push({ role: 'user', text: message });
    setDraft('');
    setSending(true);
    try {
      const token = sessionStorage.getItem(tokenKey(slug)) ?? undefined;
      const result = await siteApi.chat(slug, {
        token,
        name: token ? undefined : name,
        phone: token ? undefined : phone,
        message,
        vehicleId: token ? undefined : vehicleId,
      });

      sessionStorage.setItem(tokenKey(slug), result.token);
      setIdentified(true);

      if (result.reply) {
        push({ role: 'bot', text: result.reply });
      } else if (!result.aiEnabled) {
        push({ role: 'sys', text: 'Recebemos sua mensagem — nossa equipe responde pelo WhatsApp em instantes.' });
      }
      if (result.handedOff && !handedOff) {
        setHandedOff(true);
        push({ role: 'sys', text: 'Um vendedor foi acionado e assume a conversa a partir daqui.' });
      }
      if (!open) setUnread((n) => n + 1);
    } catch (err) {
      push({
        role: 'sys',
        text: err instanceof SiteError ? err.message : 'Não consegui responder agora. Tente pelo WhatsApp.',
      });
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  };

  const Avatar = ({ className = '' }: { className?: string }) => (
    <span className={className}>{logoUrl ? <img src={logoUrl} alt="" /> : <MessageIcon size={14} />}</span>
  );

  const showQuick = !sending && messages.every((m) => m.role !== 'user');

  return (
    <>
      {open && (
        <aside className="sf-messenger" role="dialog" aria-label={`Atendimento ${storeName}`}>
          <header className="sf-msgr-head">
            <span className="sf-msgr-avatar">
              {logoUrl ? <img src={logoUrl} alt="" /> : storeName.slice(0, 2).toUpperCase()}
            </span>
            <div className="sf-msgr-title">
              <strong>{storeName}</strong>
              <span className="sf-msgr-status">
                <i />
                Respondemos em alguns minutos
              </span>
            </div>
            <button className="sf-msgr-min" onClick={() => onOpenChange(false)} aria-label="Minimizar atendimento">
              <CloseIcon size={18} />
            </button>
          </header>

          <div className="sf-msgr-body" ref={bodyRef}>
            {messages.map((m, i) => {
              if (m.role === 'sys') {
                return (
                  <div key={i} className="sf-sysline">
                    {m.text}
                  </div>
                );
              }
              const isUser = m.role === 'user';
              const previousSame = messages[i - 1]?.role === m.role;
              return (
                <div key={i}>
                  <div className={`sf-row ${isUser ? 'sf-row-user' : ''}`}>
                    {!isUser && <Avatar className={`sf-row-avatar ${previousSame ? 'is-hidden' : ''}`} />}
                    <div className={`sf-bubble ${isUser ? 'sf-bubble-user' : 'sf-bubble-bot'}`}>{m.text}</div>
                  </div>
                  <div className={`sf-time ${isUser ? 'sf-time-user' : ''}`}>{clock(m.at)}</div>
                </div>
              );
            })}

            {sending && (
              <div className="sf-row">
                <Avatar className="sf-row-avatar" />
                <div className="sf-bubble sf-bubble-bot">
                  <span className="sf-dots" aria-label="digitando">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            )}

            {showQuick && (
              <div className="sf-quicks">
                {quickReplies.map((q) => (
                  <button key={q} className="sf-quick" onClick={() => void send(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            {handedOff && whatsapp && (
              <a
                className="sf-quick"
                style={{ alignSelf: 'center' }}
                href={whatsappLink(whatsapp, `Olá, ${storeName}! Estava conversando pelo site.`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <WhatsAppIcon size={14} />
                Continuar no WhatsApp
              </a>
            )}
          </div>

          <div className="sf-msgr-foot">
            {!identified && (
              <div className="sf-ident">
                <p>Antes de começar, como falamos com você?</p>
                <div className="sf-ident-row">
                  <input
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Seu nome"
                  />
                  <input
                    placeholder="WhatsApp"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    aria-label="Seu WhatsApp"
                  />
                </div>
              </div>
            )}

            <div className="sf-composer">
              <textarea
                ref={inputRef}
                rows={1}
                placeholder="Escreva uma mensagem…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                maxLength={1000}
                aria-label="Mensagem"
              />
              <button
                className={`sf-send ${draft.trim() && !sending ? 'is-ready' : ''}`}
                onClick={() => void send(draft)}
                disabled={!draft.trim() || sending}
                aria-label="Enviar mensagem"
              >
                <SendIcon size={17} />
              </button>
            </div>
            <p className="sf-msgr-legal">Ao enviar, você concorda em ser contatado pela loja.</p>
          </div>
        </aside>
      )}

      <div className="sf-launchers">
        {whatsapp && !open && (
          <a
            className="sf-launcher sf-launcher-whats"
            href={whatsappLink(whatsapp, `Olá, ${storeName}! Vim pelo site.`)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Falar no WhatsApp"
          >
            <WhatsAppIcon size={24} />
          </a>
        )}
        <button
          className={`sf-launcher ${open ? 'is-open' : ''}`}
          onClick={() => onOpenChange(!open)}
          aria-label={open ? 'Fechar atendimento' : 'Abrir atendimento'}
          aria-expanded={open}
        >
          {open ? <CloseIcon size={24} /> : <MessageIcon size={26} />}
          {!open && unread > 0 && <span className="sf-launcher-badge">{unread}</span>}
        </button>
      </div>
    </>
  );
}
