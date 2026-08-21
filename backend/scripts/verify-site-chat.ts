/**
 * Prova do caminho de volta do chat da vitrine - roda contra o banco configurado.
 *
 *   npm run verify:site-chat
 *
 * Cria uma loja descartável, conversa pelo site, transfere o atendimento para um
 * humano e verifica que a resposta escrita na plataforma de Tickets CHEGA ao
 * visitante. Ao final apaga tudo que criou (as contas saem por CASCADE).
 *
 * Existe porque este defeito é invisível no código: a resposta do atendente era
 * gravada certinho no ticket e simplesmente não tinha por onde voltar ao site -
 * a vitrine não é uma plataforma externa com adapter de outbound. Compilava,
 * passava em qualquer revisão de tipo, e o cliente ficava falando sozinho.
 *
 * O agente de IA é desligado na conta de teste (AgentProfile.enabled = false):
 * o que se prova aqui é o transporte das mensagens, não o modelo - e assim a
 * verificação não gasta chamada de API.
 */
import { AccountStatus, TicketStatus, UserRole } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { WILDCARD, expandPermissions } from '../src/modules/roles/permissions';
import { addInteraction, setBotEnabled, updateTicket, type CurrentUser } from '../src/modules/tickets/tickets.service';
import { fetchChatMessages, sendChatMessage } from '../src/modules/storefront/chat.service';

const SUFFIX = Date.now().toString(36);
let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  const mark = condition ? '  ok  ' : ' FALHA';
  if (!condition) failures += 1;
  // eslint-disable-next-line no-console
  console.log(`[${mark}] ${label}${detail ? ` - ${detail}` : ''}`);
}

async function makeStore(name: string) {
  const account = await prisma.account.create({
    data: { name: `${name} (teste ${SUFFIX})`, status: AccountStatus.ACTIVE },
  });
  const slug = `${name.toLowerCase()}-${SUFFIX}`;
  await prisma.storefront.create({ data: { accountId: account.id, slug, published: true } });
  // agente desligado: a verificação é do transporte, não do modelo
  await prisma.agentProfile.create({ data: { accountId: account.id, enabled: false } });

  const user = await prisma.user.create({
    data: {
      name: `Rafael Souza ${name}`,
      email: `vendedor-${name.toLowerCase()}-${SUFFIX}@teste.local`,
      passwordHash: 'x', // não faz login neste teste
      role: UserRole.ADMIN,
      accountId: account.id,
    },
  });

  const asUser: CurrentUser = {
    id: user.id,
    role: 'ADMIN',
    name: user.name,
    email: user.email,
    accountId: account.id,
    permissions: expandPermissions([WILDCARD]),
  };
  return { account, slug, asUser };
}

/** O token do chat é `<ticketId>.<emissão>.<assinatura>`. */
const ticketOf = (token: string) => token.split('.')[0];

async function main() {
  // eslint-disable-next-line no-console
  console.log(`\nChat da vitrine - verificação do caminho de volta (sufixo ${SUFFIX})\n`);

  const loja = await makeStore('LojaChat');
  const outra = await makeStore('LojaVizinha');

  // ── 1. Visitante abre a conversa pelo site ─────────────────────────────────
  const first = await sendChatMessage(loja.slug, {
    name: 'Cliente do Site',
    phone: '11988887777',
    message: 'Esse Onix ainda está disponível?',
  });
  const ticketId = ticketOf(first.token);
  check('primeira mensagem cria o atendimento', Boolean(ticketId));
  check('envio devolve cursor para o widget', Boolean(first.cursor));

  // ── 2. Transbordo: a conversa passa para um humano ─────────────────────────
  await setBotEnabled(ticketId, false, loja.asUser);
  const afterHandoff = await fetchChatMessages(loja.slug, first.token, first.cursor ?? undefined);
  check('site enxerga que o atendimento saiu da IA', afterHandoff.handedOff);

  // ── 3. O atendente responde PELA PLATAFORMA DE TICKETS ─────────────────────
  //    Este é o passo que antes não chegava a lugar nenhum.
  await addInteraction(ticketId, { type: 'AGENT_REPLY', body: 'Está sim! Posso separar para você ver hoje.' }, loja.asUser);

  const delivered = await fetchChatMessages(loja.slug, first.token, afterHandoff.cursor ?? undefined);
  const reply = delivered.messages.find((m) => m.text.startsWith('Está sim!'));
  check('resposta do atendente chega ao site', Boolean(reply));
  check('a bolha é atribuída a uma pessoa, não ao robô', reply?.from === 'agent', `from=${reply?.from}`);
  check('o visitante vê o primeiro nome de quem atende', reply?.author === 'Rafael', `author=${reply?.author}`);

  // ── 4. A mesma resposta não pode voltar duas vezes ─────────────────────────
  const again = await fetchChatMessages(loja.slug, first.token, delivered.cursor ?? undefined);
  check('consulta seguinte não repete a mensagem já entregue', again.messages.length === 0, `veio ${again.messages.length}`);

  // ── 5. Nota interna é interna ──────────────────────────────────────────────
  await addInteraction(
    ticketId,
    { type: 'INTERNAL_NOTE', body: 'Cliente pechinchou muito na última visita.' },
    loja.asUser,
  );
  const leak = await fetchChatMessages(loja.slug, first.token, delivered.cursor ?? undefined);
  check('nota interna nunca vaza para o site', !leak.messages.some((m) => m.text.includes('pechinchou')));

  // ── 6. Conversa encerrada e retomada pelo visitante ────────────────────────
  await updateTicket(ticketId, { status: TicketStatus.LOST }, loja.asUser);
  const back = await sendChatMessage(loja.slug, {
    token: first.token,
    after: leak.cursor ?? undefined,
    message: 'Mudei de ideia, ainda dá para ver hoje?',
  });
  const reopened = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { status: true, closedAt: true } });
  check('mensagem nova reabre o atendimento fechado', reopened?.status === TicketStatus.IN_PROGRESS, `status=${reopened?.status}`);
  check('reabertura limpa a data de fechamento', reopened?.closedAt === null);
  check('envio pós-transbordo não inventa resposta', back.messages.length === 0, `veio ${back.messages.length}`);

  // ── 7. Reload da página: histórico volta inteiro ───────────────────────────
  const history = await fetchChatMessages(loja.slug, back.token);
  check('sem cursor, a API devolve o histórico', history.history && history.messages.length >= 3, `veio ${history.messages.length}`);
  check(
    'histórico traz as duas pontas da conversa',
    history.messages.some((m) => m.from === 'customer') && history.messages.some((m) => m.from === 'agent'),
  );

  // ── 8. O token só vale na vitrine que o emitiu ─────────────────────────────
  let blocked = false;
  try {
    await fetchChatMessages(outra.slug, back.token);
  } catch {
    blocked = true;
  }
  check('token de uma loja não lê a conversa em outra vitrine', blocked);

  // ── Limpeza (CASCADE leva leads/tickets/interações junto) ──────────────────
  await prisma.account.deleteMany({ where: { id: { in: [loja.account.id, outra.account.id] } } });

  // eslint-disable-next-line no-console
  console.log(failures === 0 ? '\nTodas as verificações passaram.\n' : `\n${failures} verificação(ões) FALHARAM.\n`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Falha na verificação:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
