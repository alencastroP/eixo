/**
 * Cria a estrutura da base de conhecimento de uma loja - DESATIVADA.
 *
 *   npm run seed:knowledge                 (conta mais antiga)
 *   npm run seed:knowledge -- <accountId>
 *
 * Cada documento entra com `enabled: false` e o conteúdo é uma LISTA DE
 * PERGUNTAS a responder, não uma resposta pronta.
 *
 * O motivo é direto: o conteúdo desta base vira afirmação do agente para
 * clientes reais. Prazo de garantia, entrada mínima, bancos parceiros e prazo
 * de entrega são compromissos comerciais da loja - um valor plausível inventado
 * aqui viraria promessa feita em nome dela. Desativado, nada disso chega a
 * ninguém; preenchido e ativado, o agente para de responder "vou confirmar com
 * o vendedor" nas perguntas mais comuns do funil.
 *
 * Ordem sugerida de preenchimento: os quatro primeiros cobrem a maior parte das
 * dúvidas que hoje travam a conversa.
 */
import { prisma } from '../src/lib/prisma';

interface Template {
  title: string;
  questions: string[];
}

const TEMPLATES: Template[] = [
  {
    title: 'Garantia',
    questions: [
      'Quanto tempo de garantia acompanha os veículos?',
      'O que está coberto? (motor, câmbio, elétrica…)',
      'O que NÃO está coberto? (itens de desgaste: pneus, pastilhas, embreagem…)',
      'A cobertura muda conforme o ano ou a quilometragem do veículo?',
      'Como o cliente aciona a garantia? Precisa ir a alguma oficina específica?',
    ],
  },
  {
    title: 'Financiamento',
    questions: [
      'Com quais bancos e financeiras vocês trabalham?',
      'Qual a entrada mínima aceita, em porcentagem ou valor?',
      'Qual o prazo máximo de parcelamento?',
      'Quais documentos o cliente precisa apresentar?',
      'Em quanto tempo sai a resposta da análise de crédito?',
      'Aceitam cliente autônomo ou com renda informal? Em que condições?',
    ],
  },
  {
    title: 'Avaliação e troca do usado',
    questions: [
      'Vocês aceitam veículo na troca? Há restrição de marca, ano ou estado?',
      'A avaliação é feita presencialmente, por fotos, ou dos dois jeitos?',
      'O cliente precisa agendar? Quanto tempo leva?',
      'Que documentos ele deve levar?',
      'Aceitam veículo com financiamento em aberto? Como funciona a quitação?',
    ],
  },
  {
    title: 'Atendimento e localização',
    questions: [
      'Qual o endereço completo da loja?',
      'Quais os horários de funcionamento, incluindo sábado e feriados?',
      'É necessário agendar visita ou pode chegar sem aviso?',
      'Fazem test-drive? Quais as exigências (CNH, agendamento)?',
      'Qual o WhatsApp e o telefone de atendimento?',
    ],
  },
  {
    title: 'Documentação e transferência',
    questions: [
      'A transferência está inclusa no preço ou é cobrada à parte?',
      'Quanto tempo leva para o cliente receber a documentação?',
      'Quem paga IPVA, licenciamento e multas anteriores à venda?',
      'Vocês fazem a transferência para outro estado?',
    ],
  },
  {
    title: 'Pagamento e reserva',
    questions: [
      'Quais formas de pagamento são aceitas? (PIX, cartão, transferência, consórcio)',
      'É possível reservar um veículo? Há sinal? Ele é devolvido se a venda não sair?',
      'Vocês entregam em outra cidade? Há custo de frete?',
    ],
  },
];

function render(t: Template): string {
  return [
    '[A PREENCHER - este documento está desativado e não é usado pelo agente.]',
    '',
    'Responda as perguntas abaixo com as condições reais da loja e apague as que',
    'não se aplicam. Depois ative o documento na tela do Agente de IA.',
    '',
    ...t.questions.map((q) => `- ${q}`),
  ].join('\n');
}

async function main() {
  const arg = process.argv[2]?.trim();
  const account = arg
    ? await prisma.account.findUnique({ where: { id: arg }, select: { id: true, name: true } })
    : await prisma.account.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });

  if (!account) {
    throw new Error(
      arg ? `Conta não encontrada: ${arg}` : 'Nenhuma conta cadastrada. Rode antes: npm run create:admin',
    );
  }

  const existing = await prisma.knowledgeDoc.findMany({
    where: { accountId: account.id },
    select: { title: true },
  });
  const have = new Set(existing.map((d) => d.title));

  let created = 0;
  for (const t of TEMPLATES) {
    if (have.has(t.title)) continue; // idempotente: nunca sobrescreve o que a loja já escreveu
    await prisma.knowledgeDoc.create({
      data: { accountId: account.id, title: t.title, content: render(t), enabled: false },
    });
    created += 1;
  }

  /* eslint-disable no-console */
  console.log(`\nConta: ${account.name} (${account.id})`);
  console.log(`Modelos criados: ${created} · já existiam: ${TEMPLATES.length - created}`);
  console.log('\nTodos entraram DESATIVADOS. Preencha em Administração → Agente de IA →');
  console.log('Conhecimento e ative um a um. Enquanto desativados, o agente não os usa.\n');
}

main()
  .catch((err) => {
    console.error('Falha:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
