# Sistema de Cálculo V.A. + V.T. — Agil Aduaneira

Substitui a planilha mensal de Vale Alimentação, Vale Transporte e plano de saúde por um sistema
com cadastro único de colaborador e lançamento mensal recalculado automaticamente.

## Stack

HTML/CSS/JavaScript estático + Firebase (Authentication + Firestore), no mesmo padrão dos outros
sistemas internos da Agil (`follow-up-agiladuaneira-importacao`, `estudo-de-viabilidade`, etc.):
sem build, sem backend próprio, hospedado de graça no GitHub Pages.

- **Firebase Auth (Email/Senha)** — login, `login.html`
- **Firestore** — coleções `colaboradores`, `config` (doc único `geral`) e `lancamentos`
  (um documento por colaborador+mês, id `{mesReferencia}_{colaboradorId}`)
- **SheetJS (xlsx)** via CDN — exportação da folha do mês em `.xlsx`, direto no navegador

Projeto Firebase: `sistema-va-vt-agil` (console.firebase.google.com/project/sistema-va-vt-agil).

## Rodando localmente

Não precisa de servidor nem build — é só abrir os arquivos. Para testar com recarregamento
automático, qualquer servidor estático simples serve, ex.: `npx serve .`

## Publicação

GitHub Pages a partir da branch principal (raiz do repositório). As credenciais do Firebase no
código (`apiKey` etc.) são públicas por padrão no SDK client-side — a segurança real está nas
regras do Firestore (`request.auth != null` para toda leitura/escrita) e no provedor de login
habilitado no console do Firebase.

## Dados sensíveis

Nomes, salários e valores de plano de saúde dos colaboradores ficam no Firestore (não no código),
protegidos pelas regras de segurança — só usuários autenticados no sistema conseguem ler ou
escrever.
