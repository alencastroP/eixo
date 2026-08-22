# Lista de Subprocessadores - Eixo

**Documento público** · **Versão 1.0** · Vigente a partir de 22 de agosto de 2026
**Última atualização:** 22 de agosto de 2026
**Anexo ao Acordo de Tratamento de Dados (DPA), cláusula 6**

---

## O que é esta lista

Para operar a plataforma Eixo, contratamos empresas que executam parte do tratamento de dados por nossa conta - hospedagem, banco de dados, armazenamento de arquivos, envio de mensagens. Essas empresas são **subprocessadores**.

Esta lista identifica **todas** elas, com finalidade, dados envolvidos e local de processamento. Mantê-la pública e atualizada é obrigação do art. 6º, VI, da LGPD e da cláusula 6 do nosso Acordo de Tratamento de Dados.

**Compromisso de alteração:** comunicamos a inclusão ou substituição de qualquer subprocessador com **30 dias de antecedência**, por e-mail ao contato cadastrado e por aviso na plataforma. Você pode se opor de forma fundamentada em 15 dias e, não havendo solução, rescindir sem multa.

---

## 1. Infraestrutura essencial

Sem estes, a plataforma não funciona. Processam ou hospedam dados de todas as contas.

### 1.1. Hospedagem da aplicação

| | |
|---|---|
| **Fornecedor** | Render Services, Inc. |
| **Função** | Executa a API, o serviço de recepção de eventos e o processador de leads |
| **Dados** | Todos os dados em trânsito pela aplicação, durante o processamento |
| **Local de processamento** | `[REGIÃO]` - Estados Unidos |
| **Transferência internacional** | **Sim** |
| **Persistência** | Não armazena dados de forma persistente; retém logs operacionais |
| **Salvaguarda** | Cláusulas contratuais de proteção de dados; criptografia em trânsito |
| **Site** | https://render.com |

### 1.2. Banco de dados

| | |
|---|---|
| **Fornecedor** | Neon, Inc. |
| **Função** | Armazenamento primário de todos os dados da plataforma |
| **Dados** | **Todas as categorias** descritas no Anexo I do DPA |
| **Local de processamento** | `[REGIÃO - CONFIRMAR]` |
| **Transferência internacional** | `[CONFIRMAR CONFORME A REGIÃO]` |
| **Salvaguarda** | Cláusulas contratuais; criptografia em trânsito e em repouso; backups gerenciados |
| **Site** | https://neon.tech |

> **Recomendação operacional:** havendo região brasileira ou sul-americana disponível, prefira-a. Elimina a transferência internacional deste subprocessador - que é o que concentra o maior volume de dados pessoais - e reduz a latência.

### 1.3. Armazenamento de arquivos

| | |
|---|---|
| **Fornecedor** | Cloudflare, Inc. (R2 Object Storage) |
| **Função** | Armazenamento de fotografias de veículos, logotipos e imagens enviadas pelos clientes |
| **Dados** | Arquivos de imagem enviados pelas revendas. Podem conter pessoas retratadas, placas e documentos, conforme o que a revenda envia |
| **Local de processamento** | Distribuído globalmente |
| **Transferência internacional** | **Sim** |
| **Salvaguarda** | Cláusulas contratuais; criptografia em trânsito e em repouso |
| **Site** | https://cloudflare.com |

### 1.4. Rede de distribuição, DNS e proteção

| | |
|---|---|
| **Fornecedor** | Cloudflare, Inc. |
| **Função** | Entrega da aplicação e das vitrines públicas; resolução de nomes; proteção contra ataques |
| **Dados** | Dados técnicos de conexão: endereço IP, agente de usuário, URL acessada |
| **Local de processamento** | Distribuído globalmente |
| **Transferência internacional** | **Sim** |
| **Salvaguarda** | Cláusulas contratuais |

---

## 2. Funcionalidades específicas

Processam dados apenas quando a funcionalidade correspondente está ativa.

### 2.1. Geração de respostas por inteligência artificial

| | |
|---|---|
| **Fornecedor** | Anthropic PBC |
| **Função** | Gerar as respostas do agente de atendimento automatizado |
| **Dados** | **Conteúdo das conversas**; perfil de compra coletado; dados de estoque consultados; base de conhecimento e regras configuradas pela revenda |
| **Local de processamento** | Estados Unidos |
| **Transferência internacional** | **Sim** |
| **Uso para treinamento** | **Não.** Os dados enviados pela API não são utilizados para treinar modelos |
| **Ativação** | **Opcional.** Configurável por conta e desligável a qualquer momento. Desativado o agente, nenhum dado é enviado a este subprocessador |
| **Salvaguarda** | Cláusulas contratuais; termos comerciais de uso da API |
| **Site** | https://anthropic.com |
| **Pendência** | ⚠️ Firmar o acordo de tratamento de dados aplicável antes da ativação em produção |

> Este é o subprocessador que os clientes mais questionam, porque envolve o **conteúdo das conversas com os consumidores deles**. Três pontos a comunicar com clareza na venda: o agente é opcional, os dados não treinam modelos, e a revenda pode desligá-lo sem perder o atendimento humano.

### 2.2. Canal de mensagens WhatsApp

| | |
|---|---|
| **Fornecedor** | Meta Platforms, Inc. (WhatsApp Business Cloud API) |
| **Função** | Envio e recebimento de mensagens pelo WhatsApp |
| **Dados** | Número de telefone do interessado e do atendente; conteúdo das mensagens; identificadores de conta |
| **Local de processamento** | Estados Unidos e outros |
| **Transferência internacional** | **Sim** |
| **Ativação** | **Opcional.** Depende de credenciais e conta business da própria revenda |
| **Observação** | A conta e o número são de titularidade da revenda, que adere diretamente às políticas da Meta. O Eixo apenas transmite as mensagens |
| **Salvaguarda** | Termos da plataforma da Meta; cláusulas contratuais |

### 2.3. Plataformas de anúncios de veículos

| | |
|---|---|
| **Fornecedores** | OLX · Mercado Livre · Webmotors, conforme as integrações que a revenda ativar |
| **Função** | Origem dos leads e canal de resposta aos interessados |
| **Dados** | Dados de contato do interessado; conteúdo das mensagens; dados do anúncio |
| **Local de processamento** | Brasil, predominantemente |
| **Ativação** | **Opcional.** Depende de credenciais da própria revenda |
| **Observação** | O relacionamento contratual com essas plataformas é **da revenda**, que já é responsável pelos dados nelas antes de qualquer envolvimento do Eixo. O Eixo recebe e transmite dados por ordem da revenda |

---

## 3. Serviços administrativos

Não acessam dados dos clientes finais das revendas.

### 3.1. Processamento de pagamentos

| | |
|---|---|
| **Fornecedor** | `[A DEFINIR]` |
| **Função** | Processar a cobrança da assinatura e emitir documento fiscal |
| **Dados** | Razão social, CNPJ, endereço, contato de faturamento, dados de pagamento |
| **Titulares** | Apenas contratantes e seus responsáveis financeiros - **não alcança dados de clientes finais das revendas** |
| **Local de processamento** | `[A DEFINIR]` |
| **Observação** | Dados completos de cartão são tratados diretamente pela instituição de pagamento. O Eixo **não os armazena** |
| **Status** | ⚠️ **Não contratado.** Módulo de cobrança em implantação |

### 3.2. Envio de e-mail transacional

| | |
|---|---|
| **Fornecedor** | `[A DEFINIR]` |
| **Função** | Enviar comunicações operacionais: cobrança, expiração, incidente, recuperação de senha |
| **Dados** | Nome e endereço de e-mail dos usuários das contas contratantes |
| **Local de processamento** | `[A DEFINIR]` |
| **Status** | ⚠️ **Não contratado.** Envio de e-mail em implantação |

### 3.3. Bureau de crédito

| | |
|---|---|
| **Fornecedor** | `[NÃO CONTRATADO]` |
| **Função** | Consulta de informações de crédito |
| **Dados** | CPF/CNPJ e nome do titular consultado |
| **Status** | ⚠️ **Não contratado.** O módulo de crédito da plataforma **não realiza consulta a bureau**: o resultado exibido é gerado internamente para demonstração e não tem validade para decisão de crédito. **Nenhum dado é transmitido a bureau de crédito.** |
| **Quando houver contratação** | Esta linha será preenchida e comunicada com 30 dias de antecedência, e a cláusula 12.4 dos Termos de Uso será alterada |

---

## 4. Resumo

| Subprocessador | Finalidade | Fora do Brasil | Opcional |
|---|---|---|---|
| Render | Hospedagem da aplicação | Sim | Não |
| Neon | Banco de dados | `[Confirmar]` | Não |
| Cloudflare R2 | Armazenamento de imagens | Sim | Não |
| Cloudflare | Rede, DNS e proteção | Sim | Não |
| Anthropic | Respostas por inteligência artificial | Sim | **Sim** |
| Meta / WhatsApp | Canal de mensagens | Sim | **Sim** |
| OLX · Mercado Livre · Webmotors | Origem e resposta de leads | Não | **Sim** |
| `[Meio de pagamento]` | Cobrança da assinatura | `[Definir]` | Não |
| `[Provedor de e-mail]` | Comunicações operacionais | `[Definir]` | Não |

---

## 5. Transferência internacional - fundamento

Parte do tratamento ocorre fora do território nacional, conforme indicado acima.

Essas transferências observam o **art. 33 da LGPD** e são amparadas em **cláusulas contratuais de proteção de dados** firmadas com cada fornecedor, com garantias de confidencialidade, segurança, limitação de finalidade e não utilização dos dados para fins próprios.

A documentação dessas garantias fica à disposição dos clientes e da ANPD, mediante solicitação ao Encarregado.

---

## 6. Como avaliamos um subprocessador

Antes de contratar, verificamos:

1. **Segurança** - criptografia em trânsito e em repouso, controle de acesso, certificações
2. **Contrato** - existência de acordo de tratamento de dados e de cláusulas de transferência internacional
3. **Finalidade** - compromisso de não usar os dados para fins próprios nem para treinar modelos
4. **Localização** - preferência por processamento no Brasil quando disponível e viável
5. **Histórico** - incidentes públicos e como foram tratados
6. **Reversibilidade** - possibilidade de exportar os dados e trocar de fornecedor
7. **Incidentes** - prazo contratual de comunicação compatível com nossas obrigações

---

## 7. Histórico de alterações

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 22 de agosto de 2026 | Versão inicial |

---

## 8. Dúvidas e objeções

**Encarregado (DPO):** Pedro Vitor Alencastro de Oliveira · pedrovalencastro@outlook.com

Objeções fundamentadas à inclusão de subprocessador devem ser enviadas a este canal em até 15 dias da comunicação, conforme a cláusula 6.4 do Acordo de Tratamento de Dados.

---

_Pedro Vitor Alencastro de Oliveira · CPF 711.892.774-09 · Versão 1.0 · Anexo ao DPA_
