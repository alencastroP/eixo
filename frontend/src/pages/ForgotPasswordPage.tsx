import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { authApi } from '../api/endpoints';
import { BrandMark } from '../components/BrandMark';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o link. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark big">
            <BrandMark variant="orange" size={34} glow />
          </span>
          <h1>Esqueci minha senha</h1>
          <p>Informe seu e-mail e enviamos um link para redefinir sua senha.</p>
        </div>

        {sent ? (
          <>
            <p className="field-hint">
              Se <strong>{email}</strong> estiver cadastrado, você vai receber um e-mail com o link de redefinição em
              instantes. Confira também a caixa de spam.
            </p>
            <Link to="/login" className="btn btn-primary btn-block">
              Voltar para o login
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@loja.com.br"
                required
                autoFocus
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar link de recuperação'}
            </button>

            <div className="login-hint">
              <Link to="/login" className="trial-link">
                Voltar para o login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
