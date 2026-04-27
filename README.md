# ✦ Animes RD

Site estático hospedado no GitHub Pages que exibe gráficos, rankings e comparações dos animes assistidos pelo grupo. Os dados são gerenciados no Firebase Firestore e sincronizados via GitHub Actions para manter o site rápido e gratuito.

## 🔗 Páginas

| Página | Descrição |
|---|---|
| `index.html` | Tabela geral com busca, filtros e rankings |
| `suggest.html` | **Nova!** Sugira animes, vote (Assisti/Não Assisti) e avalie |
| `charts.html` | Gráficos gerais: gêneros, notas, controversia |
| `compare.html` | Comparação entre 2 pessoas: Venn, radar, notas |
| `rafael.html` | Perfil individual do Rafael |
| `fernando.html` | Perfil individual do Fernando |
| `dudu.html` | Perfil individual do Dudu |
| `hacksuya.html` | Perfil individual do Hacksuya |

---

## 🛠️ Como funciona o Fluxo

1.  **Sugestão**: Qualquer membro logado (via Google) pode sugerir um anime em `suggest.html`.
2.  **Votação**: Todos os membros (`Rafael`, `Fernando`, `Dudu`, `Hacksuya`) devem votar no anime pendente.
    *   Opções: "Assisti" (com nota e comentário) ou "Não Assisti".
3.  **Aprovação**: Uma GitHub Action roda periodicamente (ou manualmente).
    *   Se todos votaram, o anime é movido para a coleção principal.
    *   O arquivo `data/animes.json` é atualizado e o site sofre o deploy.

---

## 🚀 Setup do Projeto

### 1. Configuração do Firebase

1.  Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
2.  Ative o **Firestore Database** e o **Authentication** (habilite o provedor **Google**).
3.  Crie um **App Web** no Firebase e copie as configurações para o arquivo `js/firebase-config.js`.
4.  Gere uma chave privada em **Configurações do Projeto > Contas de Serviço > Gerar nova chave privada**. Salve como `scripts/serviceAccountKey.json` (apenas para uso local).

### 2. Configuração do GitHub

Adicione o seguinte Secret no seu repositório (**Settings > Secrets > Actions**):

| Nome | Valor |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Conteúdo completo do arquivo JSON da chave de serviço |

### 3. Migração Inicial (Opcional)

Se você já tem dados no `data/animes.json`, suba-os para o Firebase:

```bash
cd scripts
npm install
node migrate-to-firebase.js
```

---

## 🗂️ Estrutura

```
animes-rd/
├── suggest.html            # Página de submissão e votação
├── js/
│   ├── firebase-config.js  # Configurações do seu Firebase
│   ├── suggest.js          # Lógica de votação e Firestore em tempo real
│   └── data.js             # Processa o JSON estático para o site
├── data/
│   └── animes.json         # Gerado pela GitHub Action
├── scripts/
│   ├── export-and-approve-from-firebase.js # Lógica de aprovação
│   └── migrate-to-firebase.js             # Script de migração inicial
└── .github/
    └── workflows/
        └── update-from-firebase.yml        # Automação de aprovação/export
```

---

## 🛠️ Desenvolvimento local

```bash
# Necessário servidor local para ES Modules
npx serve .
```

Abra `http://localhost:3000` no navegador.
