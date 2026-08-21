import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../../lib/errors';
import * as channels from './channels.service';

/**
 * Canais de atendimento do PRÓPRIO usuário ("Meus Dados" › Canais).
 *
 * Sem `requireRole`: ao contrário de Integrações (administração da loja), aqui
 * qualquer atendente conecta o número dele. O escopo vem sempre de
 * `req.user!.id` + `req.account!.id` - nunca do corpo -, então um agente não
 * consegue mexer no canal de outro trocando um parâmetro.
 */
export const channelsRouter = Router();

/** Plataformas que oferecem canal por atendente (para a tela decidir o que exibir). */
channelsRouter.get(
  '/platforms',
  ah(async (_req, res) => {
    res.json(channels.listChannelPlatforms());
  }),
);

channelsRouter.get(
  '/',
  ah(async (req, res) => {
    res.json(await channels.listMyChannels(req.user!.id));
  }),
);

/** Remetentes disponíveis na conta da loja, com os já tomados marcados. */
channelsRouter.get(
  '/:platform/senders',
  ah(async (req, res) => {
    res.json(
      await channels.listAvailableSenders(req.account!.id, req.user!.id, req.params.platform.toLowerCase()),
    );
  }),
);

const connectSchema = z.object({ externalId: z.string().trim().min(1) });

channelsRouter.post(
  '/:platform/connect',
  ah(async (req, res) => {
    const { externalId } = connectSchema.parse(req.body);
    res.json(
      await channels.connectMyChannel(
        req.account!.id,
        req.user!.id,
        req.params.platform.toLowerCase(),
        externalId,
      ),
    );
  }),
);

channelsRouter.delete(
  '/:platform',
  ah(async (req, res) => {
    await channels.disconnectMyChannel(req.user!.id, req.params.platform.toLowerCase());
    res.status(204).end();
  }),
);
