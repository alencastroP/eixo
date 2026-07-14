import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../../lib/errors';
import { trialRateLimit } from '../../middleware/security';
import { CpfAlreadyUsedError, signupTrial } from './trial.service';

/** Rota PÚBLICA (sem autenticação) do teste gratuito. Protegida por rate limit. */
export const trialRouter = Router();

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome'),
  email: z.string().email('E-mail inválido'),
  cpf: z.string().trim().min(11, 'Informe o CPF'),
  password: z.string().min(8, 'A senha precisa de ao menos 8 caracteres'),
  companyName: z.string().trim().min(2, 'Informe o nome da empresa'),
  companyCnpj: z.string().trim().optional(),
});

trialRouter.post(
  '/signup',
  trialRateLimit,
  ah(async (req, res) => {
    const input = signupSchema.parse(req.body);
    try {
      const session = await signupTrial(input, { ip: req.ip });
      res.status(201).json(session);
    } catch (err) {
      if (err instanceof CpfAlreadyUsedError) {
        res.status(err.status).json({ error: { message: err.message, code: err.code } });
        return;
      }
      throw err;
    }
  }),
);
