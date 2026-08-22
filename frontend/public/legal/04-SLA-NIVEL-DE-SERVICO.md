# Acordo de Nível de Serviço (SLA) - Eixo

**Anexo aos Termos de Uso e Contrato de Licença de Uso de Software**
**Versão 1.0** · Vigente a partir de 22 de agosto de 2026

Este documento define o compromisso de disponibilidade da plataforma Eixo, os canais e prazos de suporte, e as compensações aplicáveis em caso de descumprimento.

---

## 1. Escopo

**1.1.** Este SLA aplica-se a **contas com plano pago ativo e adimplente**.

**1.2.** **Não** se aplica a: contas em período de teste gratuito, contas suspensas por inadimplência, ambientes de demonstração, e funcionalidades expressamente identificadas como experimentais ou em versão prévia.

---

## 2. Serviços cobertos

| Serviço | Descrição | Coberto |
|---|---|---|
| **Aplicação web** | Acesso ao sistema pelo navegador | Sim |
| **API** | Interface de programação da plataforma | Sim |
| **Recepção de leads** | Recebimento de eventos das plataformas integradas | Sim |
| **Vitrine pública** | Páginas públicas de estoque do Cliente | Sim |
| **Envio e recebimento de mensagens** | Trânsito entre a plataforma e os canais configurados | Sim, **até a fronteira do provedor do canal** |
| **Agente de inteligência artificial** | Geração de respostas automatizadas | **Não** - ver cláusula 6.2 |
| **Consulta de crédito** | Análise de crédito | **Não** - depende de terceiro |
| **Emissão de documento fiscal** | Integração fiscal | **Não** - depende de terceiro e da prefeitura |

---

## 3. Compromisso de disponibilidade

**3.1.** O Eixo compromete-se com disponibilidade mensal mínima de:

| Serviço | Disponibilidade mensal |
|---|---|
| Aplicação web e API | **99,5%** |
| Recepção de leads | **99,5%** |
| Vitrine pública | **99,5%** |

**3.2.** Referência prática: 99,5% correspondem a aproximadamente **3 horas e 39 minutos** de indisponibilidade por mês de 30 dias.

**3.3. Cálculo.** A disponibilidade é apurada por mês civil:

```
Disponibilidade (%) = (Minutos do mês - Minutos de Indisponibilidade) ÷ Minutos do mês × 100
```

**3.4. Definição de Indisponibilidade.** Considera-se indisponível o serviço que, por **5 (cinco) minutos consecutivos ou mais**, não responda a requisições legítimas ou responda com erro de servidor, verificado por monitoramento automatizado externo do Eixo.

**3.5.** Lentidão, degradação parcial de desempenho e falha de funcionalidade isolada que não impeça o uso do serviço **não** são computadas como indisponibilidade, sendo tratadas como incidente de suporte na forma da seção 5.

---

## 4. Exclusões

Não são computados como indisponibilidade os períodos decorrentes de:

**4.1.** **Manutenção programada**, comunicada na forma da seção 7.

**4.2.** **Manutenção emergencial** necessária à segurança ou à integridade do serviço.

**4.3.** Falha, indisponibilidade, alteração de API, mudança de política ou descontinuação de **serviços de terceiros** - provedores de canal de mensagem, plataformas de anúncios, bureaus, provedores de modelos de inteligência artificial, meios de pagamento, prefeituras e órgãos fiscais.

**4.4.** Falha na **conexão, equipamento, rede ou ambiente do Cliente**, incluindo bloqueios de rede corporativa e configuração incorreta de domínio próprio.

**4.5.** Uso da plataforma **em desacordo** com os Termos de Uso, com a Política de Uso Aceitável ou com os limites do Plano, inclusive volume de requisições acima do contratado.

**4.6.** Suspensão legítima da conta por inadimplência ou por violação contratual.

**4.7.** **Força maior e caso fortuito**, incluindo desastres, interrupções de fornecimento de energia ou de conectividade em larga escala, atos de autoridade e ataques cibernéticos que superem o estado da técnica de proteção razoavelmente exigível.

**4.8.** Ações realizadas por usuários do próprio Cliente, incluindo exclusão de dados e alteração de configuração.

---

## 5. Suporte

### 5.1. Canais e horário

| Canal | Endereço | Disponibilidade |
|---|---|---|
| E-mail | pedrovalencastro@outlook.com | 24 horas para abertura |
| WhatsApp | (84) 99903-3248 | Dias úteis, `[HH:MM]` às `[HH:MM]` |
| Central de ajuda | `[URL]` | Permanente |

**Horário de atendimento:** dias úteis, de segunda a sexta, das `[HH:MM]` às `[HH:MM]`, horário de Brasília, exceto feriados nacionais.

### 5.2. Classificação de severidade

| Severidade | Definição | Exemplo |
|---|---|---|
| **S1 - Crítica** | Plataforma inacessível ou funcionalidade essencial totalmente inoperante para toda a conta, sem alternativa | Ninguém consegue acessar; leads deixam de ser recebidos |
| **S2 - Alta** | Funcionalidade essencial degradada ou inoperante para parte dos usuários, com alternativa trabalhosa | Envio de mensagem falhando em um canal; vitrine fora do ar |
| **S3 - Média** | Funcionalidade secundária com defeito, com alternativa viável | Relatório com erro de exibição; filtro não aplica |
| **S4 - Baixa** | Dúvida, solicitação de melhoria, ajuste cosmético | Como configurar um perfil de acesso |

### 5.3. Prazos de resposta e de solução

Prazos contados **em horário de atendimento**, exceto S1, contado em horas corridas.

| Severidade | Primeira resposta | Solução ou contorno |
|---|---|---|
| **S1** | **1 hora** (horas corridas) | **4 horas** |
| **S2** | **4 horas** | **1 dia útil** |
| **S3** | **1 dia útil** | **5 dias úteis** |
| **S4** | **2 dias úteis** | Sem compromisso de prazo |

**5.4.** "Solução ou contorno" abrange a entrega de alternativa que restabeleça a operação, ainda que a correção definitiva ocorra depois.

**5.5.** A classificação inicial é feita pelo Eixo, com base na definição da tabela 5.2, e pode ser revista mediante justificativa do Cliente.

**5.6.** Os prazos ficam suspensos enquanto o Eixo aguardar informação, acesso ou confirmação do Cliente indispensável à investigação.

**5.7.** O suporte cobre o **uso da plataforma**. Não abrange: consultoria de negócio, treinamento personalizado além do onboarding contratado, recuperação de dados excluídos por usuários do Cliente, desenvolvimento de funcionalidade, integração com sistemas de terceiros não suportados oficialmente, e suporte à infraestrutura própria do Cliente.

---

## 6. Compromissos específicos

**6.1. Recepção de leads.** Eventos recebidos das plataformas integradas são registrados de imediato e processados com tentativas automáticas de reprocessamento em caso de falha temporária. Evento com conteúdo inválido enviado pela origem não é reprocessado e fica registrado para consulta.

**6.2. Agente de inteligência artificial.** Fora do escopo deste SLA por depender de provedor terceiro. Indisponível o provedor, a plataforma **degrada com segurança**: a conversa continua registrada, o interessado é informado de que a equipe responderá, e o atendimento humano segue funcionando normalmente pela Caixa de Entrada.

**6.3. Cópias de segurança.** O Eixo mantém cópias de segurança do banco de dados com periodicidade `[PERIODICIDADE]` e retenção de `[N]` dias, com procedimento de restauração documentado e testado periodicamente. Objetivos: **RPO `[N]`** (perda máxima de dados aceitável) e **RTO `[N]`** (tempo máximo de restabelecimento).

**6.4. Solicitação de restauração.** Pedido de restauração decorrente de exclusão feita pelo próprio Cliente é atendido **na medida do possível**, conforme o ponto de restauração disponível, e pode ser cobrado.

---

## 7. Manutenção

**7.1. Programada.** Comunicada com antecedência mínima de **48 (quarenta e oito) horas**, por e-mail e aviso na plataforma, preferencialmente em **janela noturna ou de fim de semana**, com duração estimada informada.

**7.2. Emergencial.** Pode ocorrer sem aviso prévio quando necessária para conter risco de segurança, perda de dados ou falha grave. A comunicação é feita assim que possível, com relato posterior.

**7.3.** Atualizações de rotina, correções e implantação de novas versões são realizadas **sem interrupção perceptível** sempre que a natureza da alteração permitir, e não são consideradas manutenção programada.

---

## 8. Compensação por descumprimento

**8.1.** Não atingida a disponibilidade da cláusula 3.1 em um mês civil, o Cliente adimplente tem direito a **crédito** sobre a mensalidade do plano:

| Disponibilidade apurada no mês | Crédito |
|---|---|
| De 99,0% a menos de 99,5% | **10%** da mensalidade |
| De 95,0% a menos de 99,0% | **25%** da mensalidade |
| Menor que 95,0% | **50%** da mensalidade |

**8.2. Como solicitar.** O Cliente deve requerer o crédito por escrito, ao canal de suporte, em até **30 (trinta) dias** do encerramento do mês apurado, indicando as datas e horários de indisponibilidade observados.

**8.3. Forma.** O crédito é aplicado como **abatimento na fatura seguinte**, não sendo convertido em dinheiro nem acumulado além do valor de uma mensalidade por mês apurado.

**8.4. Limite.** O crédito é o **único remédio** previsto neste SLA para descumprimento de disponibilidade, sem prejuízo do direito de rescisão da cláusula 8.5 e das responsabilidades previstas em lei.

**8.5. Rescisão por descumprimento reiterado.** Descumprida a meta de disponibilidade em **3 (três) meses dentro de um período de 12 (doze) meses**, o Cliente pode rescindir o contrato sem multa, com devolução proporcional dos valores pagos e não usufruídos.

---

## 9. Transparência

**9.1.** O Eixo mantém **página pública de status** em `[URL DA PÁGINA DE STATUS]`, com o estado atual dos serviços, incidentes em curso e histórico.

**9.2.** Incidentes de severidade S1 recebem **relato posterior** (post-mortem), publicado em até **5 (cinco) dias úteis** do restabelecimento, com causa, impacto, linha do tempo e medidas preventivas.

**9.3.** Mediante solicitação, o Eixo fornece **relatório mensal de disponibilidade** apurada.

---

## 10. Alterações

**10.1.** Alterações neste SLA que reduzam compromissos serão comunicadas com **30 (trinta) dias** de antecedência e exigirão novo aceite, facultada ao Cliente a rescisão sem ônus.

**10.2.** Aplicam-se subsidiariamente os Termos de Uso.

---

_Pedro Vitor Alencastro de Oliveira · CPF 711.892.774-09 · Versão 1.0 · Anexo aos Termos de Uso_
