/**
 * Verificação do motor de fluxo - lógica de tempo, sem tocar no banco.
 *
 *   npm run verify:flow
 *
 * Regras de relógio são o tipo de código que parece certo lendo e erra em
 * produção: janela que cruza a meia-noite, fuso com horário de verão, escada que
 * anda sozinha. Cada caso abaixo é um erro que já custou caro em algum CRM.
 */
import { computeNextAction, DEFAULT_POLICY, isQuiet, type ResolvedPolicy } from '../src/modules/flow/flow.service';

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures += 1;
  // eslint-disable-next-line no-console
  console.log(`[${condition ? '  ok  ' : ' FALHA'}] ${label}${detail ? ` - ${detail}` : ''}`);
}

/** Instante em hora local de São Paulo (UTC-3), para os testes de janela. */
function spTime(hour: number, day = 20): Date {
  return new Date(Date.UTC(2026, 7, day, hour + 3, 0, 0));
}

const policy: ResolvedPolicy = {
  ...DEFAULT_POLICY,
  enabled: true,
  followUpDelaysMin: [30, 240, 1440],
  autoCloseAfterMin: 4320,
  quietHoursStart: 20,
  quietHoursEnd: 8,
};

const base = {
  status: 'WAITING_CUSTOMER',
  botEnabled: true,
  firstResponseAt: new Date(),
  createdAt: new Date(),
};

function main() {
  // eslint-disable-next-line no-console
  console.log('\nMotor de fluxo - verificação\n');

  // ── Janela de silêncio ────────────────────────────────────────────────────
  check('meio-dia está liberado', !isQuiet(spTime(12), policy));
  check('03h da manhã está na janela de silêncio', isQuiet(spTime(3), policy));
  check('22h está na janela de silêncio', isQuiet(spTime(22), policy));
  check('08h em ponto já está liberado (fim exclusivo)', !isQuiet(spTime(8), policy));
  check('20h em ponto já está silenciado (início inclusivo)', isQuiet(spTime(20), policy));

  // Janela que NÃO cruza a meia-noite exercita o outro ramo da comparação.
  const daytimeQuiet: ResolvedPolicy = { ...policy, quietHoursStart: 12, quietHoursEnd: 14 };
  check('janela 12h-14h silencia às 13h', isQuiet(spTime(13), daytimeQuiet));
  check('janela 12h-14h libera às 15h', !isQuiet(spTime(15), daytimeQuiet));

  const noQuiet: ResolvedPolicy = { ...policy, quietHoursStart: 0, quietHoursEnd: 0 };
  check('janela vazia (0-0) nunca silencia', !isQuiet(spTime(3), noQuiet));

  // Fim de semana só é bloqueado quando businessDaysOnly está ligado.
  const weekdaysOnly: ResolvedPolicy = { ...policy, businessDaysOnly: true };
  check('sábado bloqueado com businessDaysOnly', isQuiet(spTime(12, 22), weekdaysOnly));
  check('sábado liberado sem businessDaysOnly', !isQuiet(spTime(12, 22), policy));

  // ── Escada de follow-up ───────────────────────────────────────────────────
  const now = spTime(10);
  const silentSince = new Date(now.getTime() - 10 * 60_000); // cliente calado há 10 min

  const first = computeNextAction(
    { ...base, followUpCount: 0, lastCustomerMessageAt: silentSince },
    policy,
    now,
  );
  check('1º follow-up é agendado', first?.kind === 'followup');
  check(
    '1º follow-up cai 30 min após o silêncio',
    first != null && Math.abs(first.at.getTime() - (silentSince.getTime() + 30 * 60_000)) < 1000,
  );

  const second = computeNextAction(
    { ...base, followUpCount: 1, lastCustomerMessageAt: silentSince },
    policy,
    now,
  );
  check(
    '2º follow-up usa o segundo degrau (240 min)',
    second != null && Math.abs(second.at.getTime() - (silentSince.getTime() + 240 * 60_000)) < 1000,
  );

  // Escada esgotada → só resta encerrar.
  const exhausted = computeNextAction(
    { ...base, followUpCount: 3, lastCustomerMessageAt: silentSince },
    policy,
    now,
  );
  check('escada esgotada agenda encerramento', exhausted?.kind === 'close');

  // ── Janela empurra o envio, não o cancela ─────────────────────────────────
  const lateNight = spTime(23);
  const nightSilence = new Date(lateNight.getTime() - 40 * 60_000);
  const pushed = computeNextAction(
    { ...base, followUpCount: 0, lastCustomerMessageAt: nightSilence },
    policy,
    lateNight,
  );
  check('follow-up vencido de madrugada é adiado, não perdido', pushed?.kind === 'followup');
  check(
    'adiado para fora da janela de silêncio',
    pushed != null && !isQuiet(pushed.at, policy),
    pushed ? `agendado para ${pushed.at.toISOString()}` : '',
  );

  // ── Portões de saída do motor ─────────────────────────────────────────────
  check(
    'política desligada não agenda nada',
    computeNextAction({ ...base, followUpCount: 0, lastCustomerMessageAt: silentSince }, { ...policy, enabled: false }, now) === null,
  );
  check(
    'ticket fechado não agenda nada',
    computeNextAction({ ...base, status: 'LOST', followUpCount: 0, lastCustomerMessageAt: silentSince }, policy, now) === null,
  );
  check(
    'ticket convertido não agenda nada',
    computeNextAction({ ...base, status: 'CONVERTED', followUpCount: 0, lastCustomerMessageAt: silentSince }, policy, now) === null,
  );

  // ── Encerramento vence a escada quando o prazo é curto ────────────────────
  const shortClose: ResolvedPolicy = { ...policy, autoCloseAfterMin: 20 };
  const closeWins = computeNextAction(
    { ...base, followUpCount: 0, lastCustomerMessageAt: silentSince },
    shortClose,
    now,
  );
  check('encerramento antes do 1º follow-up prevalece', closeWins?.kind === 'close');

  // eslint-disable-next-line no-console
  console.log(failures === 0 ? '\nTodas as verificações passaram.\n' : `\n${failures} verificação(ões) FALHARAM.\n`);
  if (failures > 0) process.exitCode = 1;
}

main();
