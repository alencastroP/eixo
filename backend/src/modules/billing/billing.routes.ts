import { Router } from 'express';
import { BillingCycle, BillingMethod } from '@prisma/client';
import { z } from 'zod';
import { ah } from '../../lib/errors';
import { currentUser } from '../../lib/current-user';
import { requirePermission } from '../../middleware/permissions';
import * as billing from './billing.service';

/**
 * Assinatura e pagamentos da própria loja (Administração › Pagamentos).
 *
 * `billing.view` lê; `billing.manage` move dinheiro. A separação não é
 * cerimônia: um gerente pode precisar conferir se a fatura do mês saiu sem ter
 * poder de trocar o plano ou cancelar a assinatura da empresa.
 *
 * Todas as rotas são escopadas pela conta do solicitante - não existe rota
 * aqui que receba accountId por parâmetro.
 */
export const billingRouter = Router();
billingRouter.use(requirePermission('billing.view'));

billingRouter.get(
  '/overview',
  ah(async (req, res) => {
    res.json(await billing.getOverview(currentUser(req).accountId));
  }),
);

billingRouter.get(
  '/plans',
  ah(async (_req, res) => {
    res.json(await billing.listPlans());
  }),
);

/** Pré-preenche o formulário de pagamento com o que já sabemos da loja. */
billingRouter.get(
  '/payer',
  requirePermission('billing.manage'),
  ah(async (req, res) => {
    res.json(await billing.getPayerDefaults(currentUser(req).accountId));
  }),
);

const subscribeSchema = z.object({
  planCode: z.string().trim().min(1, 'Escolha um plano'),
  cycle: z.nativeEnum(BillingCycle),
  method: z.nativeEnum(BillingMethod),
  payer: z.object({
    name: z.string().trim().min(2, 'Informe a razão social ou o nome do responsável'),
    document: z.string().trim().min(11, 'Informe o CPF ou CNPJ do pagador'),
    email: z.string().email('E-mail de cobrança inválido'),
    phone: z.string().trim().optional(),
    postalCode: z.string().trim().optional(),
    addressNumber: z.string().trim().optional(),
  }),
});

/**
 * Contrata ou troca o plano.
 *
 * Uma rota só para os dois casos porque, do ponto de vista do gateway, é a
 * mesma operação: garantir que exista UM contrato recorrente com o valor certo.
 * Separar em "assinar" e "trocar" abriria a porta para criar uma segunda
 * assinatura para quem já tem uma - cobrar o mesmo cliente duas vezes é o erro
 * mais caro possível neste módulo.
 */
billingRouter.post(
  '/subscribe',
  requirePermission('billing.manage'),
  ah(async (req, res) => {
    const input = subscribeSchema.parse(req.body);
    const user = currentUser(req);
    res.status(201).json(await billing.subscribe(user.accountId, user.id, input));
  }),
);

billingRouter.post(
  '/cancel',
  requirePermission('billing.manage'),
  ah(async (req, res) => {
    const user = currentUser(req);
    res.json(await billing.cancelSubscription(user.accountId, user.id));
  }),
);

/**
 * Reconciliação sob demanda.
 *
 * Existe para o caso em que o lojista pagou, o webhook não chegou e ele está
 * olhando para uma tela que diz que ele não pagou. Em vez de abrir chamado e
 * esperar, ele aperta um botão e nós perguntamos ao gateway.
 */
billingRouter.post(
  '/sync',
  requirePermission('billing.manage'),
  ah(async (req, res) => {
    const charges = await billing.syncCharges(currentUser(req).accountId);
    res.json(charges.map(billing.serializeCharge));
  }),
);

/** QR/copia-e-cola do PIX de uma fatura - buscado sob demanda (tem validade). */
billingRouter.get(
  '/charges/:id/pix',
  ah(async (req, res) => {
    res.json(await billing.getChargePix(currentUser(req).accountId, req.params.id));
  }),
);
