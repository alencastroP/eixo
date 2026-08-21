import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { consumeSupportSessionHash } from './api/client';
import { AuthProvider } from './auth/AuthContext';
import { ThemeProvider } from './theme/ThemeContext';
import './styles.css';
import './design-system.css';

// Precisa rodar ANTES do AuthProvider montar: é ele quem lê o token salvo
// para decidir a sessão inicial, então a troca de armazenamento (ver
// api/client.ts) tem que estar pronta antes do primeiro render.
consumeSupportSessionHash();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
