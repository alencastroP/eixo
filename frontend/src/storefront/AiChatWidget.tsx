import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { SiteError, siteApi } from './api';
import { whatsappLink } from './components';
import type { ChatMessage } from './types';
import { CloseIcon, MessageIcon, SendIcon, WhatsAppIcon } from './icons';

/**
 * Mensageiro de atendimento da vitrine.
 *
 * Do lado de fora é o widget de chat que todo visitante reconhece: launcher
 * redondo, painel flutuante, bolhas e respostas sugeridas. Por dentro, cada
 * conversa é um TICKET real do CRM — a primeira mensagem passa por
 * `ingestNormalizedLead` (a mesma porta dos leads de OLX/ML) e é respondida
 * pelo Agente de Pré-Venda IA. O atendente acompanha pela Caixa de Entrada e
 * assume quando quiser.
 *
 * CANAL DE VOLTA. Enviar não basta: quando um humano assume, a IA se desliga e o
 * POST do envio não tem mais o que responder. Por isso o widget CONSULTA o
 * servidor de tempos em tempos (`chatMessages`) — é assim que o que o atendente
 * escreve na Caixa de Entrada aparece aqui. O transbordo passa a conversa para
 * uma pessoa, não encerra o chat; o WhatsApp continua oferecido como atalho,
 * nunca como saída obrigatória.
 *
 * Sem ANTHROPIC_API_KEY a API responde `aiEnabled: false`: o lead continua
 * sendo registrado e avisamos que a resposta virá da equipe.
 */

interface Msg {
  /** id da interação no CRM; ausente nas bolhas locais (a própria digitada e os avisos) */
  id?: string;
  role: 'bot' | 'user' | 'sys';
  /** primeiro nome do atendente humano, quando a resposta não é da IA */
  author?: string | null;
  text: string;
  at: number;
}

const tokenKey = (slug: string) => `eixo.chat.${slug}`;
const cursorKey = (slug: string) => `eixo.chat.${slug}.cursor`;

/** Intervalo da consulta por novas mensagens: curto com o painel aberto (a
 *  pessoa está esperando), espaçado com ele fechado (só alimenta o badge). */
const POLL_OPEN_MS = 4_000;
const POLL_IDLE_MS = 20_000;

const clock = (at: number) => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function toMsg(m: ChatMessage): Msg {
  return {
    id: m.id,
    role: m.from === 'customer' ? 'user' : 'bot',
    author: m.author,
    text: m.text,
    at: Date.parse(m.at),
  };
}

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
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(tokenKey(slug)));
  const [identified, setIdentified] = useState(() => Boolean(sessionStorage.getItem(tokenKey(slug))));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [handedOff, setHandedOff] = useState(false);
  const [agent, setAgent] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [unread, setUnread] = useState(0);

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** marca d'água da conversa: última interação já exibida (ver ChatReply.cursor) */
  const cursorRef = useRef<string | null>(sessionStorage.getItem(cursorKey(slug)));
  /** ids já na tela — a defesa contra bolha repetida */
  const seenRef = useRef(new Set<string>());
  // em refs, não em state: o timer da consulta não deve ser recriado a cada
  // envio nem a cada abrir/fechar do painel
  const sendingRef = useRef(false);
  const handedOffRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;

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

  const rememberCursor = useCallback(
    (cursor: string | null) => {
      cursorRef.current = cursor;
      if (cursor) sessionStorage.setItem(cursorKey(slug), cursor);
    },
    [slug],
  );

  /** Último nome humano da leva — é quem está do outro lado agora. */
  const rememberAgent = (list: ChatMessage[]) => {
    const human = [...list].reverse().find((m) => m.from === 'agent' && m.author);
    if (human?.author) setAgent(human.author);
  };

  /**
   * Anexa o que veio do servidor descartando id repetido. A consulta e o envio
   * podem trazer a mesma resposta (o cursor é lido antes das mensagens, de
   * propósito — ver chat.service.ts), e repetir uma bolha é bem pior do que
   * pedi-la duas vezes.
   */
  const merge = useCallback((incoming: ChatMessage[] | undefined) => {
    // API mais antiga que este widget (janela de deploy, ou dev apontado para
    // outra API) não manda `messages`. Isso não pode virar exceção: o catch do
    // envio transformaria um descompasso de versão em "não consegui responder"
    // para todo visitante.
    if (!Array.isArray(incoming)) return;
    const fresh = incoming.filter((m) => !seenRef.current.has(m.id));
    if (fresh.length === 0) return;
    for (const m of fresh) seenRef.current.add(m.id);

    rememberAgent(fresh);
    setMessages((list) => [...list, ...fresh.map(toMsg)]);
    if (!openRef.current) setUnread((n) => n + fresh.length);
  }, []);

  /** O transbordo é um aviso, não um fim de conversa: o campo de texto continua. */
  const applyHandoff = useCallback((next: boolean) => {
    if (next === handedOffRef.current) return;
    handedOffRef.current = next;
    setHandedOff(next);
    if (next) {
      setMessages((list) => [
        ...list,
        { role: 'sys', at: Date.now(), text: 'Um vendedor entrou na conversa — pode continuar por aqui mesmo.' },
      ]);
    }
  }, []);

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
    sendingRef.current = true;
    try {
      const current = sessionStorage.getItem(tokenKey(slug)) ?? undefined;
      const result = await siteApi.chat(slug, {
        token: current,
        after: current ? (cursorRef.current ?? undefined) : undefined,
        name: current ? undefined : name,
        phone: current ? undefined : phone,
        message,
        vehicleId: current ? undefined : vehicleId,
      });

      sessionStorage.setItem(tokenKey(slug), result.token);
      setToken(result.token);
      setIdentified(true);
      setExpired(false);
      rememberCursor(result.cursor);
      merge(result.messages);

      // API anterior a este widget: a resposta vem solta em `reply`, sem id.
      // Sem isto o visitante conversaria com uma tela muda durante o deploy.
      if (!Array.isArray(result.messages) && result.reply) {
        push({ role: 'bot', text: result.reply });
      }

      // Ninguém respondeu na hora. Só vale avisar quando a IA está fora do ar:
      // com um humano na conversa, a resposta chega pela consulta em segundos e
      // um aviso desses só atrapalharia.
      if (result.messages?.length === 0 && !result.aiEnabled) {
        push({ role: 'sys', text: 'Recebemos sua mensagem — nossa equipe já vai responder por aqui.' });
      }
      applyHandoff(result.handedOff);
    } catch (err) {
      push({
        role: 'sys',
        text: err instanceof SiteError ? err.message : 'Não consegui responder agora. Tente pelo WhatsApp.',
      });
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  /**
   * Consulta periódica: é ela que traz a resposta do atendente humano. Fica
   * parada enquanto a aba está oculta ou um envio está em curso — no primeiro
   * caso ninguém está lendo, no segundo o próprio envio já devolve o que há de
   * novo.
   */
  useEffect(() => {
    if (!token || expired) return;

    let alive = true;
    const tick = async () => {
      if (!alive || sendingRef.current || document.hidden) return;
      try {
        const data = await siteApi.chatMessages(slug, token, cursorRef.current ?? undefined);
        if (!alive) return;
        rememberCursor(data.cursor);
        merge(data.messages);
        applyHandoff(data.handedOff);
      } catch (err) {
        // Token vencido (12h) ou conversa inválida: insistir só geraria erro em
        // laço. A conversa segue no WhatsApp ou numa nova mensagem.
        if (err instanceof SiteError && err.status === 403) {
          sessionStorage.removeItem(tokenKey(slug));
          sessionStorage.removeItem(cursorKey(slug));
          cursorRef.current = null;
          if (!alive) return;
          setExpired(true);
          // sem token, a próxima mensagem abre outra conversa — e para isso a
          // identificação precisa ser pedida de novo
          setIdentified(false);
          setToken(null);
          push({ role: 'sys', text: 'Esta conversa expirou. Deixe seu nome e WhatsApp para retomar o atendimento.' });
        }
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), open ? POLL_OPEN_MS : POLL_IDLE_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [token, open, expired, slug, merge, applyHandoff, rememberCursor]);

  /**
   * Reload da página: o token sobrevive no sessionStorage, as bolhas não. Sem
   * cursor a API devolve o histórico e a conversa reaparece inteira.
   */
  useEffect(() => {
    const stored = sessionStorage.getItem(tokenKey(slug));
    if (!stored) return;
    let alive = true;
    void (async () => {
      try {
        const data = await siteApi.chatMessages(slug, stored);
        if (!alive) return;
        const restored = Array.isArray(data.messages) ? data.messages : [];
        rememberCursor(data.cursor);
        for (const m of restored) seenRef.current.add(m.id);
        // mantém a saudação e recoloca a conversa embaixo dela
        setMessages((list) => [list[0], ...restored.map(toMsg)]);
        rememberAgent(restored);
        // sem aviso de transbordo aqui: a conversa está sendo remontada, não
        // acontecendo agora
        handedOffRef.current = data.handedOff;
        setHandedOff(data.handedOff);
      } catch {
        // conversa velha ou inválida: o widget simplesmente começa do zero
      }
    })();
    return () => {
      alive = false;
    };
    // só na montagem: depois disso a consulta periódica mantém tudo em dia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

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
                {agent ? `Você está falando com ${agent}` : 'Respondemos em alguns minutos'}
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
                <div key={m.id ?? `local-${i}`}>
                  <div className={`sf-row ${isUser ? 'sf-row-user' : ''}`}>
                    {!isUser && <Avatar className={`sf-row-avatar ${previousSame ? 'is-hidden' : ''}`} />}
                    <div className={`sf-bubble ${isUser ? 'sf-bubble-user' : 'sf-bubble-bot'}`}>{m.text}</div>
                  </div>
                  <div className={`sf-time ${isUser ? 'sf-time-user' : ''}`}>
                    {/* quem responde tem nome: deixa claro que ali não é mais o robô */}
                    {m.author ? `${m.author} · ${clock(m.at)}` : clock(m.at)}
                  </div>
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
