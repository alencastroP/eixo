/**
 * Verificação do adapter WhatsApp - parsing e autenticação, sem tocar no banco.
 *
 *   npm run verify:whatsapp
 *
 * O webhook da Meta é o ponto onde mais dá para errar em silêncio: o mesmo
 * endpoint entrega mensagens e recibos de entrega, a assinatura usa um segredo
 * (App Secret) diferente do que geramos para o handshake, e mídia chega sem
 * texto nenhum. Cada caso abaixo trava um desses comportamentos.
 */
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import { whatsappAdapter } from '../src/integrations/whatsapp/whatsapp.adapter';

const APP_SECRET = 'app-secret-de-teste';

/** Mensagem de texto - formato documentado da Cloud API. */
const messagePayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '102290129340398',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15550783881', phone_number_id: '106540352242922' },
            contacts: [{ profile: { name: 'Maria Souza' }, wa_id: '5584988013786' }],
            messages: [
              {
                from: '5584988013786',
                id: 'wamid.HBgN',
                timestamp: '1755700000',
                text: { body: 'Boa tarde! O Corolla 2020 ainda está disponível?' },
                type: 'text',
              },
            ],
          },
        },
      ],
    },
  ],
};

/** Recibo de entrega: chega no MESMO webhook e não pode virar ticket nem falha. */
const statusPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            statuses: [
              { id: 'wamid.HBgN', status: 'delivered', timestamp: '1755700001', recipient_id: '5584988013786' },
            ],
          },
        },
      ],
    },
  ],
};

/** Áudio: sem texto, mas o atendente precisa ver que o cliente mandou algo. */
const audioPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            contacts: [{ profile: { name: 'João' }, wa_id: '5584911112222' }],
            messages: [
              { from: '5584911112222', id: 'wamid.X', timestamp: '1755700002', type: 'audio', audio: { id: 'm1' } },
            ],
          },
        },
      ],
    },
  ],
};

function fakeRequest(body: unknown, signature?: string): Request {
  return {
    rawBody: Buffer.from(JSON.stringify(body)),
    query: {},
    header: (name: string) => (name.toLowerCase() === 'x-hub-signature-256' ? signature : undefined),
  } as unknown as Request;
}

function challengeRequest(query: Record<string, string>): Request {
  return { query, header: () => undefined } as unknown as Request;
}

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  // eslint-disable-next-line no-console
  console.log(`[${ok ? '  ok  ' : ' FALHA'}] ${label}`);
  if (!ok) {
    // eslint-disable-next-line no-console
    console.log(`          esperado: ${JSON.stringify(expected)}\n          obtido:   ${JSON.stringify(actual)}`);
  }
}

// ─── Filtro de eventos que não viram ticket ──────────────────────────────────
check('mensagem de texto não é ignorada', whatsappAdapter.shouldIgnore!(messagePayload), false);
check('recibo de entrega é ignorado', whatsappAdapter.shouldIgnore!(statusPayload), true);
check('payload desconhecido é ignorado', whatsappAdapter.shouldIgnore!({ foo: 'bar' }), true);

// ─── Normalização ────────────────────────────────────────────────────────────
const lead = whatsappAdapter.normalize(messagePayload);
check('nome vem do perfil do WhatsApp', lead.name, 'Maria Souza');
check('telefone normalizado para dígitos', lead.phone, '5584988013786');
check('corpo da mensagem preservado', lead.message, 'Boa tarde! O Corolla 2020 ainda está disponível?');
check('timestamp unix vira ISO', lead.platformReceivedAt, new Date(1755700000 * 1000).toISOString());
check('áudio vira marcador legível', whatsappAdapter.normalize(audioPayload).message, '[áudio recebido]');

// ─── Assinatura dos eventos (X-Hub-Signature-256, com o App Secret) ──────────
const body = Buffer.from(JSON.stringify(messagePayload));
const goodSig = `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`;

check('assinatura válida é aceita', whatsappAdapter.verifyRequest(fakeRequest(messagePayload, goodSig), 'x', { appSecret: APP_SECRET }), {
  ok: true,
});
check(
  'assinatura forjada é rejeitada',
  whatsappAdapter.verifyRequest(fakeRequest(messagePayload, 'sha256=forjado'), 'x', { appSecret: APP_SECRET }).ok,
  false,
);
check(
  'sem App Secret => configured:false (aceita em dev, rejeita em produção)',
  whatsappAdapter.verifyRequest(fakeRequest(messagePayload, goodSig), 'x', {}),
  { ok: false, configured: false, reason: 'App Secret não configurado para esta conta' },
);

// ─── Handshake de ativação (o segredo aqui é o NOSSO, não o da Meta) ────────
check(
  'handshake com verify token correto devolve o challenge',
  whatsappAdapter.verifyChallenge!(
    challengeRequest({ 'hub.mode': 'subscribe', 'hub.verify_token': 'segredo-da-loja', 'hub.challenge': '1234' }),
    'segredo-da-loja',
  ),
  '1234',
);
check(
  'handshake com verify token errado é rejeitado',
  whatsappAdapter.verifyChallenge!(
    challengeRequest({ 'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': '1234' }),
    'segredo-da-loja',
  ),
  null,
);

// eslint-disable-next-line no-console
console.log(failures === 0 ? '\nTodos os casos passaram.' : `\n${failures} caso(s) falharam.`);
process.exitCode = failures === 0 ? 0 : 1;
