# Setor Pessoal — Agil Aduaneira

Nasceu como substituto da planilha mensal de Vale Alimentação, Vale Transporte e plano de saúde,
com cadastro único de colaborador e lançamento mensal recalculado automaticamente. Cresceu, a
pedido da Diretoria, para um mini-sistema de RH — nome atualizado de "V.A. + V.T." para "Setor
Pessoal" para refletir isso.

## O que o sistema cobre hoje

- **Dashboard** — tela inicial: colaboradores ativos, FLASH e plano de saúde do mês, ASOs
  pendentes, férias a vencer, aniversariantes do mês, gráfico de evolução dos últimos 12 meses.
- **Lançamento Mensal** — cálculo de V.A./V.T./plano de saúde por colaborador e mês, com seleção
  em lote e exportação `.xlsx`.
- **Colaboradores** — cadastro único (cargo, setor, salário, benefícios, ASO, nascimento,
  Situação), com atalhos direto para Férias/13º/Dossiê de cada pessoa. Só lista quem está com
  Situação **Ativo**.
- **Situação do colaborador** — `Ativo` / `Afastado` / `Desligado`, sempre calculada por uma
  única função (`obterStatusColaborador()`) a partir de `statusColaborador` e `dataDemissao` —
  nenhuma tela decide isso lendo o campo legado `ativo` direto, pra não haver inconsistência
  entre abas (ex.: alguém aparecer como Ativo numa tela e Desligado em outra). Afastado exige
  Data do afastamento e Tipo/Motivo (INSS, atestado médico, licença-maternidade/paternidade,
  acidente de trabalho, outro); Previsão de retorno é opcional e nunca reativa sozinha — o
  retorno de verdade é uma ação própria ("Registrar retorno"), que grava `dataRetornoEfetivo`
  sem apagar as datas do afastamento anterior.
- **Colaboradores Inativos** — colaboradores **Afastados** ou **Desligados**; saem da lista de
  Ativos automaticamente mas mantêm todo o histórico acessível. Afastado tem a ação "Registrar
  retorno" (volta pra Ativo); Desligado tem "Reativar" (limpa a demissão) e "Excluir".
- **Parâmetros** — configurações globais: rotas intermunicipais, cargos, periodicidade de ASO,
  dias de alerta de férias/aniversário, direito padrão de férias, e-mails de alerta.
- **Histórico** — lançamentos de meses anteriores.
- **Férias** — controle de períodos por colaborador (limite legal, gozo, retorno, dias
  gozados/restantes), com alerta automático de vencimento.
- **13º Salário** — lançamento por ano/colaborador (1ª e 2ª parcela).
- **Dossiê** — histórico livre por colaborador (mudança de cargo/salário, atraso, falta,
  atestado, declaração de consulta, declaração de acompanhamento, feedback, advertência,
  multa/erros), com upload de anexo quando aplicável. Mudar a Situação do colaborador pra
  Afastado ou registrar o retorno gera automaticamente um evento "Afastamento" no Dossiê (sem
  duplicar se a edição for salva de novo sem alterar o afastamento).
- **Relatórios** — Férias (por Colaborador/Setor/Período/Geral/Vencidas/A vencer), 13º
  (Colaborador/Geral/Período) e Dossiê (Colaborador/Tipo/Período), cada um com exportação em PDF.

## Stack

HTML/CSS/JavaScript estático + Firebase (Authentication + Firestore + Storage + Cloud Functions),
no mesmo padrão dos outros sistemas internos da Agil (`follow-up-agiladuaneira-importacao`,
`estudo-de-viabilidade`, etc.): sem build, sem backend próprio, hospedado de graça no GitHub
Pages.

- **Firebase Auth (Email/Senha)** — login, `login.html`
- **Firestore** — coleções `colaboradores` (inclui `statusColaborador`/`ativo`/`dataDemissao`,
  `dataAfastamento`/`previsaoRetorno`/`tipoAfastamento`/`observacaoAfastamento`/
  `dataRetornoEfetivo`, `recebeVA`/`recebeVT`/`rotaId` opcionais — `ativo` é só um campo de
  compatibilidade, gravado a partir da Situação, nunca lido como fonte de verdade), `rotas`
  (transporte intermunicipal), `cargos`, `config` (doc único `geral`), `lancamentos`
  (`{mesReferencia}_{colaboradorId}`), `ferias`, `decimoTerceiro` (`{ano}_{colaboradorId}`),
  `dossie` (inclui `anexoPath` nos registros novos e `anexoUrl` só em legados) e `emailsAlerta`
- **Firebase Storage** — anexos privados do Dossiê (atestado, declaração de consulta, declaração
  de acompanhamento, feedback), path `dossie/{colaboradorId}/{timestamp}_{nomeArquivo}`, PDF/JPEG/
  PNG até 10 MB (exige plano Blaze). Regras em `storage.rules`: leitura e escrita exigem usuário
  autenticado, sem link público permanente — "Ver arquivo" busca o conteúdo autenticado na hora
  via `getBytes()` e abre um Blob local (`getDownloadURL()` não é mais usado em uploads novos,
  só registros legados salvos antes dessa correção continuam com link direto)
- **Cloud Functions (v2)** — alerta diário por e-mail de aniversariantes (`functions/`)
- **SheetJS (xlsx)** via CDN — exportação da folha do mês em `.xlsx`, direto no navegador
- **`window.print()` + `@media print`** — geração dos relatórios em PDF, sem dependência nova

Projeto Firebase: `sistema-va-vt-agil` (console.firebase.google.com/project/sistema-va-vt-agil).

## Rodando localmente

Não precisa de servidor nem build — é só abrir os arquivos. Para testar com recarregamento
automático, qualquer servidor estático simples serve, ex.: `npx serve .`

## Publicação

GitHub Pages a partir da branch principal (raiz do repositório). As credenciais do Firebase no
código (`apiKey` etc.) são públicas por padrão no SDK client-side — a segurança real está nas
regras do Firestore (`request.auth != null` para toda leitura/escrita) e no provedor de login
habilitado no console do Firebase.

## Pendências para a V2

- Central de Movimentações (histórico estruturado de múltiplos afastamentos por colaborador —
  hoje só o afastamento mais recente fica nos campos do cadastro; o evento fica registrado no
  Dossiê, mas não como uma lista própria).
- Alerta automático quando a Previsão de retorno vencer.
- Card de Afastamentos no Dashboard.

## Dados sensíveis

Nomes, salários e valores de plano de saúde dos colaboradores ficam no Firestore (não no código),
protegidos pelas regras de segurança — só usuários autenticados no sistema conseguem ler ou
escrever.
