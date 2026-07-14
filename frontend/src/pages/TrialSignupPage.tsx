import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../components/BrandMark';
import { isValidCpf, maskCpf, onlyDigits } from '../utils/cpf';

export function TrialSignupPage() {
  const { user, initializing, signupTrial } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', cpf: '', password: '', companyName: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cpfValid = useMemo(() => isValidCpf(form.cpf), [form.cpf]);
  const cpfTouched = onlyDigits(form.cpf).length === 11;

  if (!initializing && user) return <Navigate to="/tickets" replace />;

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const canSubmit =
    form.name.trim().length >= 2 &&
    /.+@.+\..+/.test(form.email) &&
    cpfValid &&
    form.password.length >= 8 &&
    form.companyName.trim().length >= 2;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    // validação no cliente (feedback rápido) — o back-end revalida de forma autoritativa
    if (!isValidCpf(form.cpf)) {
      setError('CPF inválido. Verifique os dígitos.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signupTrial({ ...form, cpf: onlyDigits(form.cpf) });
      navigate('/tickets');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.message); // CPF já usou trial / e-mail já cadastrado
      } else {
        setError(err instanceof ApiError ? err.message : 'Não foi possível criar seu teste. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card trial-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="brand-mark big">
            <BrandMark variant="orange" size={34} glow />
          </span>
          <h1>
            Teste grátis <span className="brand-accent">15 dias</span>
          </h1>
          <p>Sem cartão de crédito. Ative sua conta em 1 minuto.</p>
        </div>

        <label className="field">
          <span>Seu nome</span>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome completo" required autoFocus />
        </label>

        <label className="field">
          <span>E-mail</span>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="voce@loja.com.br" required />
        </label>

        <label className="field">
          <span>CPF</span>
          <input
            value={form.cpf}
            onChange={(e) => set('cpf', maskCpf(e.target.value))}
            placeholder="000.000.000-00"
            inputMode="numeric"
            className={cpfTouched ? (cpfValid ? 'input-ok' : 'input-bad') : ''}
            required
          />
          {cpfTouched && !cpfValid && <span className="field-hint bad">CPF inválido — confira os dígitos.</span>}
        </label>

        <label className="field">
          <span>Nome da empresa</span>
          <input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Sua revenda" required />
        </label>

        <label className="field">
          <span>Senha</span>
          <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Mínimo 8 caracteres" required />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit || submitting}>
          {submitting ? 'Criando sua conta…' : 'Começar teste grátis'}
        </button>

        <div className="login-hint">
          <span>Já tem conta?</span>
          <Link to="/login" className="trial-link">Entrar</Link>
        </div>
      </form>
    </div>
  );
}
