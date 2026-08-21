/**
 * Textos e HTML dos e-mails transacionais.
 *
 * Cada função devolve `{ subject, html, text }` pronto para `sendEmail`. Todo
 * template tem par HTML/texto simples - clientes de e-mail corporativos ainda
 * caem no texto puro, e é o que decide se a mensagem chega legível ou vira
 * spam por "só imagem, sem texto".
 *
 * O conjunto aqui é deliberadamente ENXUTO: só os avisos amarrados a uma
 * mudança de estado que o produto já decide sozinho (trial vencendo, cobrança
 * falhou, acesso voltou). Não é canal de marketing, boas-vindas ou notícia -
 * ver legal/02-POLITICA-DE-PRIVACIDADE.md §2.3 sobre a distinção entre
 * comunicação operacional (sempre ativa) e comercial (com descadastro).
 */
import { env } from '../config/env';
import type { EmailContent } from './email';

const BRAND_COLOR = '#ff6b35'; // laranja ignição - mesmo tom do front (--accent)

interface Cta {
  label: string;
  path: string; // relativo a env.appUrl, ex.: '/billing'
}

function layout(title: string, paragraphs: string[], cta?: Cta): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;">${p}</p>`).join('\n');
  const ctaHtml = cta
    ? `<div style="margin-top:22px;"><a href="${env.appUrl}${cta.path}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 24px;border-radius:8px;">${cta.label}</a></div>`
    : '';
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${BRAND_COLOR};padding:18px 28px;">
                <span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.3px;">Eixo</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 16px;font-size:17px;color:#18181b;">${title}</h1>
                <div style="font-size:14px;line-height:1.6;color:#3f3f46;">${body}</div>
                ${ctaHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 28px 20px;border-top:1px solid #f0f0f0;">
                <p style="margin:0;font-size:11.5px;color:#a1a1aa;">
                  Este é um e-mail automático da plataforma Eixo sobre a sua conta.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function plainText(title: string, paragraphs: string[], cta?: Cta): string {
  const lines = [title, '', ...paragraphs.map(stripTags)];
  if (cta) lines.push('', `${cta.label}: ${env.appUrl}${cta.path}`);
  lines.push('', '— Eixo');
  return lines.join('\n');
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function build(subject: string, title: string, paragraphs: string[], cta?: Cta): EmailContent {
  return { subject, html: layout(title, paragraphs, cta), text: plainText(title, paragraphs, cta) };
}

const b = (s: string) => `<strong>${s}</strong>`;

// ─── Trial ───────────────────────────────────────────────────────────────────

export function trialPreExpiryWarningEmail(params: { accountName: string; daysLeft: number; trialEndsAt: Date }): EmailContent {
  const dias = params.daysLeft <= 1 ? 'amanhã' : `em ${params.daysLeft} dias`;
  return build(
    `Seu teste grátis termina ${dias}`,
    `Seu período de teste está terminando`,
    [
      `Olá! O período de teste gratuito de <strong>${escapeHtml(params.accountName)}</strong> termina ${b(dias)}, no dia ${formatDate(params.trialEndsAt)}.`,
      `Para continuar usando o Eixo sem interrupção, escolha um plano antes dessa data. Se não escolher, o acesso é pausado automaticamente - mas seus dados ficam preservados.`,
    ],
    { label: 'Escolher plano', path: '/billing' },
  );
}

export function trialExpiredEmail(params: { accountName: string }): EmailContent {
  return build(
    'Seu período de teste terminou',
    'O acesso foi pausado',
    [
      `O período de teste gratuito de <strong>${escapeHtml(params.accountName)}</strong> chegou ao fim, e o acesso à plataforma foi pausado.`,
      `Seus dados continuam guardados e nada foi perdido. Assine um plano a qualquer momento para reativar o acesso na hora.`,
    ],
    { label: 'Assinar um plano', path: '/billing' },
  );
}

// ─── Billing - mudança de estado de acesso ────────────────────────────────────

export function billingGraceStartedEmail(params: { accountName: string; graceDays: number }): EmailContent {
  return build(
    'Não conseguimos confirmar seu pagamento',
    'Pagamento não confirmado',
    [
      `Não conseguimos confirmar o pagamento da assinatura de <strong>${escapeHtml(params.accountName)}</strong>.`,
      `O acesso continua funcionando normalmente por ${b(`${params.graceDays} dias`)} enquanto isso se resolve. Verifique o cartão cadastrado ou a fatura pendente para evitar a pausa do acesso.`,
    ],
    { label: 'Ver fatura', path: '/billing' },
  );
}

export function billingAccessBlockedEmail(params: { accountName: string }): EmailContent {
  return build(
    'Acesso pausado por pendência de pagamento',
    'Acesso pausado',
    [
      `O acesso de <strong>${escapeHtml(params.accountName)}</strong> foi pausado por falta de confirmação de pagamento.`,
      `Seus dados estão preservados. Assim que o pagamento for confirmado, o acesso volta automaticamente - sem precisar falar com o suporte.`,
    ],
    { label: 'Regularizar pagamento', path: '/billing' },
  );
}

export function billingAccessRestoredEmail(params: { accountName: string }): EmailContent {
  return build(
    'Pagamento confirmado - acesso liberado',
    'Tudo certo de novo',
    [
      `Recebemos a confirmação do pagamento de <strong>${escapeHtml(params.accountName)}</strong> e o acesso já está liberado.`,
      `Obrigado por continuar com o Eixo.`,
    ],
    { label: 'Acessar a plataforma', path: '/dashboard' },
  );
}

export function billingSubscriptionCanceledEmail(params: { accountName: string }): EmailContent {
  return build(
    'Sua assinatura foi encerrada',
    'Assinatura encerrada',
    [
      `A assinatura de <strong>${escapeHtml(params.accountName)}</strong> chegou ao fim do período já pago e foi encerrada, como solicitado.`,
      `Seus dados continuam disponíveis para exportação por 30 dias. Depois desse prazo, são eliminados definitivamente. Você pode assinar novamente a qualquer momento.`,
    ],
    { label: 'Assinar novamente', path: '/billing' },
  );
}

export function billingAccessSuspendedEmail(params: { accountName: string }): EmailContent {
  return build(
    'Conta suspensa - pagamento contestado',
    'Conta suspensa',
    [
      `Identificamos um estorno ou contestação (chargeback) no pagamento de <strong>${escapeHtml(params.accountName)}</strong>, e o acesso foi suspenso.`,
      `Se isso não foi solicitado por você, ou se acredita que houve um engano, entre em contato com o suporte o quanto antes para regularizar.`,
    ],
  );
}

// ─── Utilitários ───────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(date);
}
