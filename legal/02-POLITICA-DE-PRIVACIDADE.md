# Política de Privacidade - Eixo

**Versão 1.0** · Vigente a partir de 22 de agosto de 2026

Esta Política explica como Pedro Vitor Alencastro de Oliveira, CPF nº 711.892.774-09, pessoa física prestadora da plataforma Eixo ("Eixo", "nós"), trata dados pessoais na plataforma Eixo, em conformidade com a **Lei nº 13.709/2018 (LGPD)**.

Escrevemos este documento para ser lido. Onde houver termo técnico, ele é explicado na primeira vez em que aparece.

---

## 1. Os dois papéis do Eixo - leia esta seção primeiro

O Eixo é uma plataforma usada por **revendas de veículos** para gerir estoque, atendimento e vendas. Isso cria duas situações diferentes, com regras diferentes:

### 1.1. Quando somos **Controladores**

Somos Controladores - isto é, **nós** decidimos como e por que os dados são tratados - em relação a:

- dados de **cadastro e faturamento da revenda contratante**;
- dados dos **usuários da plataforma** (as pessoas que trabalham na revenda e acessam o sistema);
- dados de quem **visita nosso site**, solicita demonstração ou nos contata;
- dados de quem inicia um **período de teste gratuito**.

Esta Política descreve integralmente esses tratamentos.

### 1.2. Quando somos **Operadores**

Somos Operadores - isto é, tratamos os dados **por conta e ordem da revenda**, seguindo as instruções dela - em relação a:

- **clientes finais e interessados** da revenda (leads, contatos, propostas);
- **conversas de atendimento** (WhatsApp, site, plataformas de anúncios);
- **consultas de crédito** realizadas pela revenda;
- **dados de venda, financeiros e fiscais** lançados pela revenda.

> **Se você é cliente de uma revenda** e quer saber o que foi feito com os seus dados, exercer direitos ou pedir exclusão, **procure diretamente a revenda com a qual você teve contato** - ela é a Controladora desses dados. Se nos procurar, encaminharemos sua solicitação a ela e informaremos você.

As obrigações do Eixo como Operador estão detalhadas no **Acordo de Tratamento de Dados (DPA)**, disponível em `[URL DO DPA]`.

---

## 2. Dados que tratamos como Controladores

### 2.1. Cadastro e contratação

| Dado | Origem | Finalidade | Base legal (LGPD) |
|---|---|---|---|
| Nome, e-mail, telefone | Você, no cadastro | Criar e identificar a conta, comunicar | Execução de contrato (art. 7º, V) |
| Senha (armazenada apenas como hash) | Você | Autenticação | Execução de contrato |
| Razão social, nome fantasia, CNPJ, endereço | Você | Contratação, emissão de nota fiscal | Execução de contrato e obrigação legal (art. 7º, II e V) |
| **CPF do responsável pelo teste gratuito** | Você, no cadastro de teste | **Impedir a obtenção repetida do período gratuito** | Legítimo interesse - prevenção à fraude (art. 7º, IX e art. 11, II, "g") |
| Dados de faturamento e histórico de cobranças | Você e o meio de pagamento | Cobrança, cumprimento fiscal | Execução de contrato e obrigação legal |

**Não coletamos nem armazenamos o número completo do seu cartão de crédito.** O pagamento é processado por instituição de pagamento terceira, que nos devolve apenas identificadores e o resultado da transação.

### 2.2. Uso da plataforma

| Dado | Finalidade | Base legal |
|---|---|---|
| Registros de acesso (data, hora, IP, agente de usuário) | Segurança, auditoria, cumprimento do art. 15 do Marco Civil da Internet | Obrigação legal e legítimo interesse |
| Trilha de auditoria de ações no sistema (quem fez o quê) | Segurança, rastreabilidade, suporte | Legítimo interesse e execução de contrato |
| Métricas de uso e desempenho | Operar, dimensionar e melhorar o serviço | Legítimo interesse |
| Registro do aceite dos termos (versão, data, IP, agente) | Prova da contratação | Execução de contrato e exercício de direitos |

### 2.3. Comunicação e marketing

| Dado | Finalidade | Base legal |
|---|---|---|
| E-mail e telefone de contato | Comunicações operacionais: cobrança, falha de pagamento, incidente, mudança de termos, manutenção | Execução de contrato e obrigação legal |
| E-mail | Comunicações comerciais e novidades do produto | Legítimo interesse, com **descadastramento em um clique** em toda mensagem |
| Dados de formulário de contato ou demonstração | Responder e apresentar proposta | Procedimentos preliminares de contrato (art. 7º, V) |

**Comunicações operacionais não podem ser desativadas** enquanto o contrato estiver vigente - elas são parte da prestação do serviço.

---

## 3. O tratamento do CPF no período de teste gratuito

Este tratamento merece explicação própria porque envolve um dado sensível do ponto de vista de fraude.

**Por que pedimos.** O teste gratuito de 15 dias é oferecido **uma vez por pessoa**. Sem um identificador estável, bastaria trocar de e-mail para obter testes indefinidos, o que inviabilizaria a oferta.

**O que fazemos com ele:**

1. **Validamos** o CPF pelo algoritmo oficial de dígitos verificadores.
2. Geramos um **código irreversível** a partir dele (HMAC-SHA256 com chave secreta mantida fora do banco de dados). É esse código, e não o CPF, que usamos para verificar se aquele CPF já usou o teste. A operação **não pode ser desfeita**: de posse do banco de dados, não é possível recuperar o CPF.
3. Guardamos ainda uma **cópia cifrada** do CPF (AES-256-GCM), acessível apenas mediante procedimento interno restrito, exclusivamente para apuração de fraude e atendimento a autoridade.

**Por quanto tempo.** O código irreversível é mantido **por prazo indeterminado**, porque é ele que sustenta a regra de "um teste por pessoa" - se apagássemos, a regra deixaria de existir. A cópia cifrada é eliminada em **`[N]` dias** após a conversão em plano pago ou o encerramento definitivo da conta.

**Seus direitos aqui.** Você pode se opor a este tratamento e solicitar revisão (art. 18, §2º). Note, porém, que a eliminação do código irreversível implica **perda da possibilidade de identificar reuso do período gratuito**, razão pela qual essa exclusão pode ser recusada de forma fundamentada, com base no legítimo interesse de prevenção à fraude.

---

## 4. Com quem compartilhamos dados

Não vendemos dados pessoais. Compartilhamos apenas o necessário, e apenas com:

**4.1. Prestadores de serviço (subprocessadores).** Empresas que nos apoiam na operação - hospedagem, armazenamento de arquivos, envio de e-mail, processamento de pagamento e geração de respostas por inteligência artificial. Todos estão identificados, com finalidade e localização, na **Lista de Subprocessadores** (`[URL DA LISTA]`), que mantemos atualizada e cuja alteração comunicamos previamente.

**4.2. Autoridades públicas**, quando houver requisição legal, ordem judicial ou obrigação regulatória. Avaliamos a legitimidade de cada pedido e, quando permitido, informamos o titular.

**4.3. Em reorganização societária** (fusão, aquisição, incorporação), hipótese em que esta Política continua aplicável até que o sucessor publique a sua, com comunicação prévia aos titulares.

**4.4. Inteligência artificial.** Quando o recurso de atendimento automatizado está ativo, o **conteúdo das conversas** e os dados de contexto necessários são enviados ao provedor de modelos de linguagem indicado na Lista de Subprocessadores, exclusivamente para gerar a resposta.

---

## 5. Transferência internacional de dados

Parte da nossa infraestrutura e alguns prestadores estão **fora do Brasil**. Isso significa que dados podem ser transferidos e processados no exterior.

Essas transferências ocorrem com base no art. 33 da LGPD, apoiadas em **cláusulas contratuais de proteção de dados** firmadas com cada prestador, e limitadas ao necessário à prestação do serviço. A Lista de Subprocessadores indica a localização de processamento de cada um.

---

## 6. Por quanto tempo guardamos

| Categoria | Prazo |
|---|---|
| Dados cadastrais e da conta | Enquanto o contrato vigorar, e por **30 dias** após o encerramento (janela de exportação) |
| Dados do Cliente após encerramento | Eliminados em até **30 dias** após a janela de exportação; cópias de segurança seguem o ciclo de rotação, que não excede `[N]` dias |
| Registros de acesso a aplicações de internet | **6 meses** (art. 15 do Marco Civil da Internet) |
| Trilha de auditoria de ações no sistema | **730 dias** |
| Registros brutos de eventos recebidos de plataformas integradas | **90 dias** |
| Consultas de crédito | **365 dias** |
| Dados fiscais, contábeis e de faturamento | Pelo prazo da legislação aplicável, em regra **5 anos** |
| Código irreversível do CPF do teste gratuito | Indeterminado (ver seção 3) |
| Dados necessários ao exercício de direitos em processo | Até o trânsito em julgado |

Os prazos de auditoria, eventos e consultas de crédito são executados por rotina automatizada de expurgo. Findos os prazos, os dados são **eliminados ou anonimizados** de forma irreversível.

---

## 7. Como protegemos

Adotamos medidas técnicas e administrativas compatíveis com o risco, entre elas:

- **Isolamento entre contas**: cada revenda opera em um espaço lógico próprio, e o sistema filtra todo acesso pelo identificador da conta antes de qualquer outra regra.
- **Criptografia em trânsito** (TLS) em todas as conexões, com HSTS.
- **Criptografia em repouso** (AES-256-GCM) das credenciais de integração fornecidas pelos clientes e do CPF do período de teste.
- **Senhas** armazenadas apenas como hash com algoritmo de derivação lenta (bcrypt) - não temos acesso à sua senha.
- **Autenticação** por token de curta duração com renovação rotativa e revogação.
- **Controle de acesso por perfil**, com permissões verificadas a cada requisição.
- **Limitação de tentativas** de login e de requisições, para conter ataques automatizados.
- **Cabeçalhos de segurança** e política de conteúdo restritiva na aplicação web.
- **Mascaramento automático de dados pessoais nos registros de log** - e-mail, telefone e CPF/CNPJ nunca aparecem em texto claro nos nossos logs.
- **Trilha de auditoria** das ações relevantes, com identificação do responsável.
- **Rotina de expurgo** automatizada para cumprir os prazos da seção 6.

Nenhuma medida elimina integralmente o risco. Se ocorrer incidente de segurança com risco relevante, seguimos o **Plano de Resposta a Incidentes** e comunicamos a ANPD e os titulares afetados na forma do art. 48 da LGPD.

---

## 8. Seus direitos

Como titular, você pode a qualquer momento (art. 18 da LGPD):

| Direito | O que significa |
|---|---|
| **Confirmação e acesso** | Saber se tratamos dados seus e obter cópia |
| **Correção** | Corrigir dados incompletos, inexatos ou desatualizados |
| **Anonimização, bloqueio ou eliminação** | Quando desnecessários, excessivos ou tratados em desconformidade |
| **Portabilidade** | Receber seus dados em formato estruturado e de uso comum |
| **Eliminação dos dados tratados com consentimento** | Quando a base legal for o consentimento |
| **Informação sobre compartilhamento** | Saber com quem compartilhamos |
| **Informação sobre a possibilidade de não consentir** | E as consequências disso |
| **Revogação do consentimento** | A qualquer tempo, sem efeito retroativo |
| **Oposição** | Opor-se a tratamento baseado em legítimo interesse |
| **Revisão de decisão automatizada** | Solicitar revisão humana de decisão tomada apenas por sistema |

**Como exercer:** escreva para pedrovalencastro@outlook.com. Respondemos em até **15 (quinze) dias**. Podemos solicitar confirmação de identidade antes de atender - é uma proteção contra pedidos fraudulentos em nome de terceiros.

Pedidos que envolvam dados sob controle de uma revenda são **encaminhados a ela**, e informamos você sobre o encaminhamento.

Você também pode apresentar reclamação diretamente à **Autoridade Nacional de Proteção de Dados (ANPD)**.

---

## 9. Decisões automatizadas

A plataforma pode exibir **indicadores de análise de crédito** e **respostas geradas por inteligência artificial**.

- Esses recursos são **ferramentas de apoio**. A decisão de negociar, financiar ou recusar é tomada pela revenda, por pessoa humana.
- O agente de inteligência artificial **se identifica como atendimento automatizado** e não conclui negócios.
- Você pode solicitar **revisão humana** de qualquer decisão que o afete e que tenha sido tomada com base nesses recursos, na forma do art. 20 da LGPD. Para dados sob controle da revenda, o pedido deve ser dirigido a ela.

---

## 10. Crianças e adolescentes

A plataforma é destinada ao uso profissional por maiores de 18 anos. **Não coletamos intencionalmente dados de crianças e adolescentes.** Identificado tratamento dessa natureza sem base legal adequada, os dados são eliminados.

---

## 11. Cookies

O uso de cookies e tecnologias semelhantes está descrito na **Política de Cookies** (`[URL DA POLÍTICA DE COOKIES]`).

---

## 12. Encarregado (DPO)

**Encarregado pelo Tratamento de Dados Pessoais:** Pedro Vitor Alencastro de Oliveira
**E-mail:** pedrovalencastro@outlook.com
**Endereço:** Rua Três Barras, 2966, Potengi, Natal/RN, CEP 59110-450

Este é o canal para dúvidas, exercício de direitos e comunicações da ANPD.

---

## 13. Alterações desta Política

Podemos atualizar esta Política. Alterações relevantes são comunicadas por e-mail e por aviso na plataforma com **30 (trinta) dias** de antecedência.

Toda versão é identificada por número e data de vigência, e as versões anteriores ficam disponíveis em `[URL DO HISTÓRICO]`.

---

_Pedro Vitor Alencastro de Oliveira · CPF 711.892.774-09 · eixocrm.com · Versão 1.0_
