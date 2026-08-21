/**
 * Envio de e-mail transacional (Resend).
 *
 * Mesmo princípio dos outros integradores opcionais (`aiEnabled`,
 * `billingEnabled`): sem `RESEND_API_KEY`, o envio vira log e a aplicação
 * segue normal. Um aviso de trial ou de cobrança não pode derrubar o cron nem
 * a resposta ao webhook do gateway só porque o provedor de e-mail está fora
 * do ar ou ainda não foi configurado.
 *
 * Por isso `sendEmail` NUNCA lança para quem chama. Quem chama já fez a parte
 * que importa - bloquear ou liberar acesso, por exemplo; o e-mail é o aviso
 * sobre o que já aconteceu, não a ação em si.
 */
import { Resend } from 'resend';
import { emailEnabled, env } from '../config/env';
import { logger } from './logger';
import { prisma } from './prisma';

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!emailEnabled()) return null;
  if (!client) client = new Resend(env.email.apiKey);
  return client;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * Envia um e-mail. Devolve `false` em qualquer cenário de não-entrega (sem
 * configuração, erro do provedor, exceção de rede) - quem chama decide se
 * isso merece um log próprio; esta função já loga o motivo.
 */
export async function sendEmail(to: string, content: EmailContent): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    logger.info('e-mail não enviado - RESEND_API_KEY ausente (modo stub)', { to, subject: content.subject });
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: env.email.from,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      ...(env.email.replyTo ? { replyTo: env.email.replyTo } : {}),
    });
    if (error) {
      logger.error('falha ao enviar e-mail', { to, subject: content.subject, error });
      return false;
    }
    logger.info('e-mail enviado', { to, subject: content.subject });
    return true;
  } catch (err) {
    logger.error('falha ao enviar e-mail', { to, subject: content.subject, err });
    return false;
  }
}

/**
 * A quem avisar sobre o estado de uma conta.
 *
 * Prioriza o e-mail de FATURAMENTO (quem assinou, quem paga a fatura) e só cai
 * para o primeiro administrador ativo quando não há um - mesma prioridade que
 * `getPayerDefaults()` usa no módulo de billing para pré-preencher o
 * pagador. Conta sem nenhum dos dois (recém-criada, sem admin) devolve null e
 * quem chama decide não enviar, em vez de arriscar mandar para ninguém.
 */
export async function resolveAccountEmail(accountId: string): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      billingEmail: true,
      users: {
        where: { role: 'ADMIN', active: true },
        select: { email: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  return account?.billingEmail || account?.users[0]?.email || null;
}
