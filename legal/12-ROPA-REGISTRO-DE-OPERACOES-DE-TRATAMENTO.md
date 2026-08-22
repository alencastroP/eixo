# Registro das Operações de Tratamento de Dados Pessoais (ROPA)

**Documento interno** · **Versão 1.0** · 22 de agosto de 2026
**Fundamento:** art. 37 da Lei nº 13.709/2018
**Responsável pela manutenção:** Encarregado (DPO)
**Revisão:** trimestral, e sempre que houver novo tratamento

---

## Como ler este registro

O ROPA é dividido em **duas partes**, porque o Eixo ocupa dois papéis distintos:

- **Parte I - Eixo como Controlador:** tratamentos que nós decidimos, sobre dados dos nossos clientes, dos usuários deles e dos visitantes do nosso site.
- **Parte II - Eixo como Operador:** tratamentos que executamos **por conta e ordem** das revendas, sobre os dados dos clientes finais delas. Aqui a base legal é definida pela revenda, não por nós - registramos a operação, não a sua legitimidade.

Cada linha identifica a estrutura de dados correspondente no sistema, para que a verificação de coerência entre documento e realidade seja possível.

---

# Parte I - Eixo como Controlador

## 1.1. Cadastro e gestão de contas

| Item | Descrição |
|---|---|
| **Finalidade** | Criar, identificar e administrar a conta contratante e seus usuários |
| **Titulares** | Responsáveis e funcionários das revendas contratantes |
| **Dados** | Nome, e-mail, senha (apenas hash), vínculo com a conta, perfil de acesso, situação; razão social, nome fantasia, CNPJ |
| **Origem** | Fornecidos pelo titular ou pelo administrador da conta |
| **Base legal** | Execução de contrato (art. 7º, V) |
| **Compartilhamento** | Provedor de hospedagem e banco de dados |
| **Transferência internacional** | Sim - ver Lista de Subprocessadores |
| **Retenção** | Durante o contrato + 30 dias (janela de exportação); eliminação em até 30 dias após |
| **Estruturas** | `users`, `accounts`, `access_profiles` |
| **Segurança** | Senha em hash bcrypt; controle de acesso por perfil; isolamento por conta; auditoria |

## 1.2. Autenticação e sessões

| Item | Descrição |
|---|---|
| **Finalidade** | Autenticar o acesso e manter a sessão com segurança |
| **Titulares** | Usuários da plataforma |
| **Dados** | Identificador do usuário, hash do token de renovação, data de emissão, expiração e revogação |
| **Base legal** | Execução de contrato; legítimo interesse em segurança (art. 7º, IX) |
| **Retenção** | Até a expiração ou revogação; expurgo automático posterior |
| **Estruturas** | `refresh_tokens` |
| **Segurança** | Token de acesso de curta duração; renovação rotativa; algoritmo de assinatura fixado; hash do token de renovação |

## 1.3. Controle antifraude do período de teste

> Tratamento de maior sensibilidade sob nosso controle. Detalhado na seção 3 da Política de Privacidade.

| Item | Descrição |
|---|---|
| **Finalidade** | Impedir a obtenção repetida do período gratuito pela mesma pessoa |
| **Titulares** | Responsáveis por cadastro de teste gratuito |
| **Dados** | **Código irreversível derivado do CPF** (HMAC-SHA256 com chave secreta externa ao banco); **cópia cifrada do CPF** (AES-256-GCM); data de uso; vínculo com a conta |
| **Origem** | Fornecido pelo titular no cadastro |
| **Base legal** | Legítimo interesse - prevenção à fraude (art. 7º, IX) |
| **Teste de balanceamento** | Sem identificador estável, a oferta gratuita seria inviável. Adotou-se a alternativa **menos invasiva possível**: o CPF não é armazenado em texto claro; o que sustenta a regra é um código irreversível. A expectativa do titular é preservada - o dado não é usado para nenhuma outra finalidade, não é compartilhado e não alimenta perfilamento. |
| **Compartilhamento** | Nenhum |
| **Retenção** | **Código irreversível: indeterminado** (é ele que sustenta a regra). **Cópia cifrada: `[N]` dias** após conversão ou encerramento definitivo |
| **Sobrevive ao encerramento da conta** | Sim - o vínculo com a conta é desfeito, o registro permanece |
| **Estruturas** | `trial_cpf_registry` |
| **Direito de oposição** | Admitido, com possibilidade de recusa fundamentada quanto ao código irreversível |
| **Pendência** | ⚠️ Definir e registrar formalmente o prazo `[N]` da cópia cifrada, e implementar seu expurgo |

## 1.4. Faturamento e cobrança

| Item | Descrição |
|---|---|
| **Finalidade** | Cobrar a assinatura, controlar inadimplência, emitir documento fiscal |
| **Titulares** | Contratantes e seus responsáveis financeiros |
| **Dados** | Razão social, CNPJ, endereço, contato de faturamento, plano, situação da assinatura, identificadores da assinatura no meio de pagamento, histórico de cobranças |
| **Base legal** | Execução de contrato (art. 7º, V) e obrigação legal (art. 7º, II) |
| **Compartilhamento** | Instituição de pagamento; contabilidade; administração tributária |
| **Retenção** | Registros fiscais e contábeis: prazo legal, em regra **5 anos** |
| **Estruturas** | `accounts`, `subscriptions`, `plans` |
| **Observação** | **Não são armazenados dados completos de cartão de crédito** |
| **Pendência** | ⚠️ Módulo de cobrança não implementado. Reavaliar esta linha na integração do meio de pagamento |

## 1.5. Registros de acesso e trilha de auditoria

| Item | Descrição |
|---|---|
| **Finalidade** | Segurança, rastreabilidade de ações, apuração de incidentes, cumprimento legal |
| **Titulares** | Usuários da plataforma; visitantes |
| **Dados** | Data e hora, endereço IP, agente de usuário, identificador do usuário, ação praticada, entidade afetada |
| **Base legal** | Obrigação legal - art. 15 do Marco Civil da Internet; legítimo interesse em segurança |
| **Retenção** | Registros de acesso: **6 meses**. Trilha de auditoria: **730 dias**, com expurgo automatizado |
| **Estruturas** | `audit_logs`; registros de log da aplicação |
| **Segurança** | **Mascaramento automático de dados pessoais nos logs** - e-mail, telefone, CPF/CNPJ e segredos são redigidos antes da gravação |

## 1.6. Suporte ao cliente

| Item | Descrição |
|---|---|
| **Finalidade** | Atender solicitações, investigar defeitos, orientar o uso |
| **Titulares** | Usuários das contas contratantes |
| **Dados** | Contato, conteúdo da solicitação e, quando indispensável, acesso restrito a dados da conta |
| **Base legal** | Execução de contrato |
| **Retenção** | `[N]` meses após o encerramento do atendimento |
| **Segurança** | Acesso administrativo pelo menor privilégio, individualmente identificado e registrado em auditoria |
| **Pendência** | ⚠️ Painel administrativo do operador não implementado. Enquanto não existir, o suporte que exigir acesso a dados depende de procedimento manual - registrar cada ocorrência |

## 1.7. Comunicação com clientes

| Item | Descrição |
|---|---|
| **Finalidade** | (a) Comunicações operacionais: cobrança, falha de pagamento, expiração, incidente, mudança de termos, manutenção. (b) Comunicações comerciais e novidades |
| **Titulares** | Contatos das contas contratantes |
| **Dados** | Nome, e-mail, telefone, situação da conta |
| **Base legal** | (a) Execução de contrato e obrigação legal. (b) Legítimo interesse, com descadastramento em um clique |
| **Compartilhamento** | Provedor de envio de e-mail |
| **Retenção** | Enquanto durar a relação; oposições registradas por prazo indeterminado |
| **Pendência** | ⚠️ Envio de e-mail não implementado. Reavaliar esta linha na contratação do provedor |

## 1.8. Contato comercial e demonstração

| Item | Descrição |
|---|---|
| **Finalidade** | Responder a interessados e apresentar proposta |
| **Titulares** | Interessados na contratação |
| **Dados** | Nome, e-mail, telefone, empresa, conteúdo da mensagem |
| **Base legal** | Procedimentos preliminares de contrato, a pedido do titular (art. 7º, V) |
| **Retenção** | `[24]` meses do último contato, se não houver contratação |

---

# Parte II - Eixo como Operador

> Nestes tratamentos, **a revenda contratante é a Controladora**. Ela define finalidade e base legal; o Eixo executa conforme instruções documentadas, nos termos do DPA. Cada linha registra a operação realizada por nossa infraestrutura.

## 2.1. Gestão de leads e interessados

| Item | Descrição |
|---|---|
| **Operação** | Receber, normalizar, deduplicar, armazenar e disponibilizar contatos de interessados |
| **Titulares** | Clientes finais e interessados das revendas |
| **Dados** | Nome, telefone, e-mail, **CPF/CNPJ**, plataforma de origem, identificador externo, campos personalizados, **perfil de compra** (orçamento, forma de pagamento, veículo de interesse, veículo na troca, urgência, preferências) |
| **Origem** | Plataformas de anúncios integradas, formulário da vitrine, chat, cadastro manual |
| **Base legal** | **Definida pela revenda** - em regra, procedimentos preliminares de contrato ou legítimo interesse |
| **Retenção** | Definida pela revenda; eliminação e anonimização disponíveis a qualquer tempo |
| **Estruturas** | `leads` |
| **Isolamento** | ✅ Vinculado à conta |
| **Recursos ao titular** | Exportação estruturada; **anonimização irreversível** que preserva apenas dados estatísticos |

## 2.2. Atendimento e conversas

| Item | Descrição |
|---|---|
| **Operação** | Registrar e organizar o atendimento; distribuir entre atendentes; medir tempo de resposta |
| **Titulares** | Interessados em contato com a revenda |
| **Dados** | Conteúdo integral das mensagens, anotações internas, situação, prioridade, responsável, marcações temporais |
| **Observação de risco** | Campo de texto livre: **pode conter dados pessoais imprevisíveis**, inclusive sensíveis, inseridos livremente pelo titular ou pelo atendente. É a categoria mais difícil de controlar |
| **Base legal** | Definida pela revenda |
| **Retenção** | Definida pela revenda |
| **Estruturas** | `tickets`, `ticket_interactions` |
| **Isolamento** | ✅ Vinculado à conta |

## 2.3. Recepção de eventos das plataformas integradas

| Item | Descrição |
|---|---|
| **Operação** | Receber, enfileirar e processar eventos de plataformas de anúncios e canais |
| **Dados** | **Conteúdo bruto do evento**, com dados pessoais em texto claro conforme enviado pela origem |
| **Base legal** | Definida pela revenda |
| **Retenção** | **90 dias** após processamento ou falha, com expurgo automatizado |
| **Estruturas** | `webhook_events` |
| **Isolamento** | ✅ Vinculado à conta |
| **Justificativa do prazo** | O conteúdo bruto só é útil para reprocessamento e diagnóstico. Passado esse prazo, é risco sem contrapartida |

## 2.4. Geração de respostas por inteligência artificial

| Item | Descrição |
|---|---|
| **Operação** | Transmitir conteúdo da conversa e contexto a provedor de modelo de linguagem para gerar resposta |
| **Titulares** | Interessados que conversam pelos canais com o agente ativo |
| **Dados** | Conteúdo da conversa, perfil de compra coletado, dados de estoque, base de conhecimento e regras configuradas pela revenda |
| **Base legal** | Definida pela revenda |
| **Compartilhamento** | **Provedor de modelo de linguagem** - ver Lista de Subprocessadores |
| **Transferência internacional** | **Sim** |
| **Vedação** | Os dados **não são utilizados para treinar modelos** |
| **Retenção no destinatário** | Conforme contrato com o provedor - ver Lista de Subprocessadores |
| **Estruturas** | `agent_profiles`, `knowledge_docs`, `flow_policies` |
| **Ativação** | Configurável por conta; desligável a qualquer momento |
| **Transparência** | O agente se identifica como automatizado - ver Aviso de Transparência de IA |

## 2.5. Automação de acompanhamento

| Item | Descrição |
|---|---|
| **Operação** | Enviar mensagens automáticas de acompanhamento após silêncio do interessado; encerrar atendimentos inativos; alertar sobre prazo de primeira resposta |
| **Base legal** | Definida pela revenda |
| **Estruturas** | `flow_policies` |
| **Salvaguardas** | Nasce **desativado** por padrão; janela de silêncio configurável (padrão 20h-8h); número máximo de tentativas |
| **Justificativa do padrão desligado** | Enviar mensagem a um consumidor é ação externa e irreversível. Ativar automaticamente para todas as contas faria o sistema falar com pessoas sem que ninguém tivesse decidido isso |

## 2.6. Consulta de crédito

> ⚠️ **Tratamento de maior risco da plataforma.** Ver Termo de Consentimento para Consulta de Crédito.

| Item | Descrição |
|---|---|
| **Operação** | Consultar e armazenar informações de crédito de titular indicado pela revenda |
| **Titulares** | Interessados submetidos a análise |
| **Dados** | **CPF/CNPJ em texto claro**, nome, pontuação de crédito, relatório completo, usuário responsável, vínculo com o lead |
| **Base legal** | **Consentimento do titular**, a ser obtido pela revenda |
| **Retenção** | **365 dias**, com expurgo automatizado |
| **Estruturas** | `credit_queries` |
| **Isolamento** | ❌ **NÃO vinculado à conta** - ver pendências |
| **Situação da origem** | ⚠️ **Bureau não contratado.** O resultado é gerado internamente para demonstração |
| **Pendências** | ⚠️ **(1)** Vincular à conta e filtrar por ela em toda leitura. **(2)** Implementar registro de consentimento e bloqueio no servidor quando ausente. **(3)** Estender a checagem à ferramenta do agente de IA. **(4)** Exibir aviso de resultado simulado enquanto não houver bureau |

## 2.7. Estoque de veículos

| Item | Descrição |
|---|---|
| **Operação** | Cadastrar e gerir veículos, custos, fotografias e situação de venda |
| **Dados pessoais eventuais** | Dados de proprietário anterior, comprador ou vendedor, quando inseridos pela revenda em campos de identificação ou observação |
| **Base legal** | Definida pela revenda |
| **Estruturas** | `vehicles`, `vehicle_photos`, `vehicle_costs` |
| **Isolamento** | ✅ Vinculado à conta |
| **Armazenamento de arquivos** | Imagens em armazenamento de objetos - ver Lista de Subprocessadores |

## 2.8. Registros financeiros e fiscais

| Item | Descrição |
|---|---|
| **Operação** | Registrar lançamentos financeiros e documentos fiscais da revenda |
| **Dados pessoais eventuais** | Identificação de contrapartes - nome, documento |
| **Base legal** | Definida pela revenda; em regra obrigação legal e execução de contrato |
| **Retenção** | Prazo fiscal aplicável à revenda |
| **Estruturas** | `financial_entries`, `fiscal_invoices` |
| **Isolamento** | ✅ Vinculado à conta |

## 2.9. Vitrine pública

| Item | Descrição |
|---|---|
| **Operação** | Publicar página pública com estoque e receber contatos de visitantes |
| **Titulares** | Visitantes da vitrine |
| **Dados** | Dados de contato informados, conteúdo do chat, preferências de busca, dados técnicos de acesso |
| **Base legal** | Definida pela revenda |
| **Estruturas** | `storefronts` |
| **Isolamento** | ✅ Vinculado à conta |
| **Obrigação da revenda** | Publicar política de privacidade própria e exibir razão social, CNPJ e contato |

## 2.10. Canais de mensagem e integrações

| Item | Descrição |
|---|---|
| **Operação** | Transmitir e receber mensagens pelos canais configurados; armazenar credenciais fornecidas pela revenda |
| **Dados** | Número de telefone dos atendentes; identificadores de conta nos provedores; **credenciais de acesso** |
| **Base legal** | Execução de contrato com a revenda |
| **Compartilhamento** | Provedores dos canais - ver Lista de Subprocessadores |
| **Estruturas** | `user_channels`, `integrations`, `integration_dispatches` |
| **Segurança** | **Credenciais cifradas em repouso (AES-256-GCM)**, com chave mantida fora do banco de dados |
| **Isolamento** | ✅ Vinculado à conta |

---

# Parte III - Prazos de retenção consolidados

| Categoria | Prazo | Automatizado |
|---|---|---|
| Conteúdo bruto de eventos recebidos | 90 dias | ✅ |
| Consultas de crédito | 365 dias | ✅ |
| Trilha de auditoria | 730 dias | ✅ |
| Tokens de renovação expirados ou revogados | Imediato após expiração | ✅ |
| Registros de acesso a aplicações de internet | 6 meses | ⚠️ Verificar |
| Dados do cliente após encerramento | 30 dias de exportação + 30 dias para eliminação | ⚠️ Não implementado |
| Cópia cifrada do CPF do período de teste | `[N]` dias | ⚠️ Não implementado |
| Código irreversível do CPF do teste | Indeterminado | Por desenho |
| Dados fiscais e contábeis | 5 anos (regra geral) | Manual |
| Registro de aceite dos termos | Prazo prescricional | ⚠️ Não implementado |

Os prazos automatizados são executados pela rotina de expurgo (`npm run purge`), que **deve estar agendada em produção**.

---

# Parte IV - Pendências consolidadas

Ordenadas por risco.

| # | Pendência | Impacto | Prioridade |
|---|---|---|---|
| 1 | **Consultas de crédito não isoladas por conta** | Contradiz o DPA e a Política de Privacidade; dado sensível compartilhado entre clientes | 🔴 Bloqueador |
| 2 | **Consulta de crédito sem registro de consentimento nem bloqueio no servidor** | Tratamento sem base legal demonstrável; alcança também a ferramenta do agente de IA | 🔴 Bloqueador |
| 3 | **Resultado de crédito simulado sem aviso em tela** | Risco de publicidade enganosa e de decisão comercial baseada em dado fictício | 🔴 Bloqueador |
| 4 | **Registro de aceite dos termos inexistente** | Impossibilidade de provar a contratação e a versão aceita | 🔴 Bloqueador |
| 5 | **Configurações globais não isoladas por conta** (`settings`) | Verificar se contêm dado de negócio por revenda | 🟠 Alta |
| 6 | **Rotina de expurgo sem agendamento confirmado em produção** | Prazos de retenção declarados e não cumpridos | 🟠 Alta |
| 7 | **Prazo da cópia cifrada do CPF não definido nem implementado** | Retenção indefinida de dado que deveria ter prazo | 🟠 Alta |
| 8 | **Exportação e eliminação em nível de conta não implementadas** | Cláusula 10 do DPA não executável | 🟠 Alta |
| 9 | **Painel administrativo do operador inexistente** | Suporte com acesso a dados sem trilha adequada | 🟡 Média |
| 10 | **Envio de e-mail não implementado** | Comunicação de incidente e de titular depende de canal manual | 🟡 Média |
| 11 | **Verificação da retenção de registros de acesso (6 meses)** | Conferir se a política é efetivamente aplicada | 🟡 Média |

---

_Documento interno · Pedro Vitor Alencastro de Oliveira · Versão 1.0 · Revisão trimestral pelo Encarregado_
