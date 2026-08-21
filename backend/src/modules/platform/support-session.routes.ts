import { Router } from 'express';
import { ah } from '../../lib/errors';
import * as platformService from './platform.service';

/**
 * Encerrar a PRÓPRIA sessão de suporte - chamado de DENTRO da conta do
 * cliente (autenticado como "Suporte Eixo"), nunca da conta-plataforma. Por
 * isso mora fora de `/api/platform` e do gate `requirePlatformAccount`: quem
 * chama aqui não pertence à conta-plataforma, pertence à conta que está
 * sendo assistida.
 */
export const supportSessionRouter = Router();

supportSessionRouter.post(
  '/end',
  ah(async (req, res) => {
    await platformService.endOwnSupportSession(req.user!.id);
    res.status(204).end();
  }),
);
