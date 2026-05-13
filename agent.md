# 📺 AniLiber Platform - Agent Context

Este arquivo serve como a "Fonte da Verdade" sobre a arquitetura, regras de negócio e estado atual do projeto para agentes de IA.

## 1. Visão Geral
O **AniLiber** é uma plataforma multi-tenant de gerenciamento de catálogos de animes. Os usuários podem criar grupos independentes, sugerir animes via API do MyAnimeList (MAL), votar com notas e comentários, e manter uma biblioteca pessoal portátil entre grupos.

## 2. Tech Stack
- **Backend**: Supabase (PostgreSQL, Auth, RLS).
- **Frontend**: Vanilla JavaScript (ES Modules), HTML5, CSS3.
- **Integrações**: Jikan API (v4), Google News RSS, SimpleIcons.
- **Deploy**: GitHub Pages (Subdiretório `/animes-rd/`).
- **Automação**: GitHub Actions (Cleanup de 5 dias).

## 3. Arquitetura de Dados (Supabase)

### Tabelas Principais (Normalizadas)
1.  **`animes` (Global Cache)**:
    - `mal_id` (PK, Integer): ID oficial do MyAnimeList.
    - `name`, `genres` (TEXT[]), `image_url` (Cache da Jikan).
2.  **`group_animes` (Instâncias)**:
    - `group_id` (FK), `mal_id` (FK).
    - `status` ('pending', 'approved').
    - `links` (JSONB): Links específicos do grupo (YouTube, Drive).
3.  **`votes` (Votos)**:
    - `group_id`, `mal_id`, `user_id` (FK), `score` (NUMERIC), `comment` (TEXT).
4.  **`group_members` (Membros)**:
    - `group_id`, `user_id`, `nickname`, `color`, `role`, `openings` (JSONB).
5.  **`user_library` (Histórico Privado)**:
    - `user_id`, `mal_id`, `last_score`, `last_comment`.

## 4. Regras de Negócio & Automação

### Fluxo de Aprovação (Trigger SQL)
- Monitora a tabela `votes`.
- Se o número de votos distintos no par `(group_id, mal_id)` for maior ou igual ao número de membros do grupo, o status na `group_animes` muda automaticamente para `'approved'`.

### Regra dos 5 Dias (GitHub Actions)
- Script `scripts/supabase-cleanup.js`.
- Busca animes `'pending'` com mais de 5 dias de criação.
- Vota automaticamente `'Não Assisti'` (`score: null`) para membros faltantes, forçando a aprovação.

### Privacidade & Importação
- Ao entrar em um grupo, o acervo **não** é preenchido automaticamente.
- O usuário usa o **Assistente de Importação** (`suggest.html`) para selecionar títulos de sua `user_library` e sugerir ao grupo atual.
- O sistema bloqueia a importação de animes que já existem no `group_animes` do grupo alvo.

## 5. Frontend & Navegação

### Roteamento e Estado
- O contexto do grupo é mantido via **URL Hash Fragment** (ex: `index.html#g=UUID`).
- **`js/utils.js`**: Contém a função `updateNavbarState` que faz o patch de todos os links `<a>` da página em tempo real para injetar o `#g=...` e manter a persistência.

### Páginas Dinâmicas
- **`index.html` (Dashboard)**: Gerencia login, grupos e administração.
- **`profile.html`**: Página única para todos os membros. Lê `#p=Nickname&g=UUID` para renderizar estatísticas.
- **`blog.html`**: Carrossel Hero com troca de tons de cor e integração de notícias.

### Identidade Visual (Cores Dinâmicas)
- O script `js/home.js` usa um truque de **Canvas 2D** (`colorToRgb`) para extrair os componentes R, G, B da cor do membro (seja Hex ou Nome) e injetar como variáveis CSS.
- Isso gera degradês de fundo dinâmicos nos cards de membros.

## 6. Convenções de Código
- **Cache Busting**: Todos os scripts e links de CSS devem usar a query string de versão atual: `?v=platform-v8`.
- **Relacionamentos Supabase**: Sempre use Join explícito com `!inner` ou especificando a tabela para evitar erros de cache do PostgREST.
- **Segurança**: Nunca ignore o RLS. Funções sensíveis devem usar `SECURITY DEFINER` com cautela.

## 7. Estado Atual
- Migração Firebase -> Supabase: **Concluída**.
- Normalização de Tabelas: **Concluída**.
- Perfis Dinâmicos: **Concluídos**.
- Sistema de Importação Seletiva: **Concluído**.
- Indicador de Pendências (Navbar Badge): **Concluído**.

---
*Agente, ao realizar modificações, certifique-se de não quebrar a persistência do `groupId` na URL e respeitar a estrutura normalizada das tabelas.*
