# GEMINI.md - Contexto do Projeto AniLiber

Este arquivo fornece diretrizes e visão geral técnica para interações com o projeto **AniLiber**.

## 🚀 Visão Geral do Projeto
AniLiber é uma plataforma para grupos de amigos gerenciarem catálogos compartilhados de animes, votarem em títulos e visualizarem estatísticas.
- **Arquitetura:** Site estático (HTML/JS/CSS) hospedado no GitHub Pages.
- **Backend:** Supabase (PostgreSQL, Authentication, Realtime).
- **Dados:** Originalmente no Firebase, agora migrado para Supabase.

## 🛠️ Stack Tecnológica
- **Frontend:** HTML5, Vanilla JavaScript (ES Modules), CSS3 (Variáveis nativas).
- **Backend-as-a-Service:** Supabase (via `supabase-client.js`).
- **APIs Externas:** Jikan API (MyAnimeList) para busca de metadados.
- **Automação:** GitHub Actions para faxina e manutenção de dados.

## 🗂️ Estrutura de Arquivos Principal
- `/js/`: Lógica do sistema em módulos ES.
    - `supabase-client.js`: Inicialização do cliente Supabase.
    - `auth.js`: Fluxo de login (Google OAuth) e logout.
    - `data.js`: Carregamento e processamento central de dados (membros, animes, votos).
    - `utils.js`: Helpers globais, gestão de contexto de grupo (`g=` na URL) e renderização da navbar.
- `/sql/`: Definições do banco de dados (atualmente no Supabase).
- `/scripts/`: Utilitários Node.js para manutenção (limpeza, migração, otimização).
- `*.html`: Pontos de entrada para as diferentes funcionalidades (Dashboard, Acervo, Comparar, etc.).

## 🔑 Fluxo de Dados e Contexto
1. **Autenticação:** Gerenciada pelo Supabase. A maioria das páginas requer login.
2. **Contexto de Grupo:** Identificado pelo parâmetro `g` na URL ou Hash (ex: `acervo.html#g=UUID`). O `getGroupId()` em `utils.js` é o padrão para recuperar este ID.
3. **Persistência:** 
    - `profiles`: Dados globais de usuários.
    - `groups`: Grupos criados.
    - `group_members`: Vinculação de usuários a grupos com nickname e cor personalizada.
    - `animes`: Cache global de metadados de animes (MAL ID).
    - `group_animes`: Instâncias de animes dentro de um grupo específico.
    - `votes`: Votos individuais.
    - `legacy_votes`: Votos antigos migrados do Firebase.
    - `user_library`: Acervo pessoal do usuário (util para importar animes em outros grupos).

## 🛠️ Desenvolvimento Local
1. **Servidor:** Use um servidor estático para rodar os ES Modules:
   ```bash
   npx serve .
   ```
2. **Setup:** Certifique-se de que o `supabase-client.js` está apontando para o projeto correto.

## 📏 Convenções de Código
- **Estilo:** Seguir o padrão definido no `.prettierrc.json`.
- **Vanilla JS:** Priorizar o uso de JavaScript puro sem frameworks pesados.
- **URL Routing:** Usar fragmentos de URL (#) para parâmetros que precisam sobreviver a recarregamentos ou redirecionamentos de Auth no GitHub Pages.
- **Segurança:** As Row Level Security (RLS) do Supabase devem ser respeitadas. O `service_role` só deve ser usado em scripts de backend (`scripts/`).

## ✅ Checklist de Mudanças
- Ao adicionar novas páginas, garantir que a `navbar.html` seja carregada e o contexto do grupo seja preservado nos links.
- Sempre atualizar o cache-busting query parameter (`?v=vX`) em imports e links HTML após mudanças significativas no CSS/JS.
- Validar se novas funções no Supabase não causam recursão infinita em políticas RLS.
