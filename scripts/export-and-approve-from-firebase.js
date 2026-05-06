const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Use a chave de serviço do Firebase, que deve estar como secret no GitHub Actions
// Certifique-se de que o arquivo 'serviceAccountKey.json' esteja acessível ou que as credenciais estejam configuradas corretamente para o ambiente do GitHub Actions.

// **IMPORTANTE:** No GitHub Actions, o secret `FIREBASE_SERVICE_ACCOUNT_KEY` conterá o JSON completo.
// Para rodar localmente, você precisará criar um arquivo `scripts/serviceAccountKey.json` manualmente.
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  // Ambiente GitHub Actions (usa a Secret)
  console.log("Usando credenciais da variável de ambiente...");
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} else {
  // Ambiente local (usa o arquivo)
  console.log("Usando credenciais do arquivo local serviceAccountKey.json...");
  try {
    serviceAccount = require("./serviceAccountKey.json");
  } catch (err) {
    console.error("Erro: Arquivo serviceAccountKey.json não encontrado e variável FIREBASE_SERVICE_ACCOUNT_KEY não definida.");
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const PEOPLE = ["Rafael", "Fernando", "Dudu", "Hacksuya", "Zana"];

async function exportAndApproveAnimes() {
  console.log("Iniciando aprovação de animes pendentes e exportação para JSON...");

  const pendingAnimesRef = db.collection("pending_animes");
  const animesRef = db.collection("animes");
  const metadataRef = db.collection("metadata").doc("stats");

  const batch = db.batch();

  try {
    // 1. Processar animes pendentes
    const pendingAnimesSnapshot = await pendingAnimesRef.get();
    let approvedCount = 0;

    const now = new Date();
    const AUTO_VOTE_THRESHOLD_MS = 5 * 24 * 60 * 60 * 1000; // 5 dias

    for (const doc of pendingAnimesSnapshot.docs) {
      const animeId = doc.id;
      let animeData = doc.data();
      const createdAt = animeData.createdAt ? animeData.createdAt.toDate() : now;
      const isStale = (now - createdAt) > AUTO_VOTE_THRESHOLD_MS;

      // Lógica de Voto Automático para animes parados há mais de 5 dias
      if (isStale && animeData.votedUserIds.length < PEOPLE.length) {
        console.log(`Anime parado há mais de 5 dias: ${animeData.nome}. Registrando votos automáticos...`);
        
        const updatedVotes = { ...animeData.votes };
        const updatedVotedUserIds = [ ...animeData.votedUserIds ];
        let changesMade = false;

        for (const personName of PEOPLE) {
          if (!updatedVotes[personName]) {
            console.log(`   - Registrando 'Não assisti' automático para: ${personName}`);
            updatedVotes[personName] = {
              score: null,
              comment: "",
              votedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            // Adiciona um placeholder de sistema no votedUserIds para completar a contagem
            updatedVotedUserIds.push(`system-auto-${personName.toLowerCase()}`);
            changesMade = true;
          }
        }

        if (changesMade) {
          await doc.ref.update({
            votes: updatedVotes,
            votedUserIds: updatedVotedUserIds
          });
          // Atualiza o objeto local para que a lógica de aprovação abaixo o pegue nesta mesma rodada
          animeData.votes = updatedVotes;
          animeData.votedUserIds = updatedVotedUserIds;
        }
      }

      // Verifica se todos votaram (seja voto real ou automático do sistema acima)
      if (animeData.votedUserIds && animeData.votedUserIds.length >= PEOPLE.length) {
        console.log(`Processando anime pendente: ${animeData.nome} (ID: ${animeId})`);

        // Prepara os dados para a coleção 'animes'
        const finalAnime = {
          id: animeId, // Mantém o ID original
          nome: animeData.nome,
          generos: animeData.generos,
          malId: animeData.malId || null,
          comentarios: "", 
          comments: [], // Novo campo estruturado
          files: animeData.files || [],
          maisDeUmVoto: "nao",
          qtdVotos: 0,
          controversia: 0,
          notaSort: 0,
          notaRafael: null,
          notaFernando: null,
          notaDudu: null,
          notaHacksuya: null,
          notaZana: null, // Novo campo para Zana
          quemAssistiu: [],
        };

        let totalScore = 0;
        let scoreCount = 0;
        const allComments = [];

        // Processa os votos individuais para popular os campos finais
        for (const personName of PEOPLE) {
          const vote = animeData.votes?.[personName];
          if (vote && vote.score !== null && vote.score !== undefined) { // Voto de "Assisti" com nota
            finalAnime.quemAssistiu.push(personName);
            totalScore += vote.score;
            scoreCount++;

            if (personName === "Rafael") finalAnime.notaRafael = vote.score;
            if (personName === "Fernando") finalAnime.notaFernando = vote.score;
            if (personName === "Dudu") finalAnime.notaDudu = vote.score;
            if (personName === "Hacksuya") finalAnime.notaHacksuya = vote.score;
            if (personName === "Zana") finalAnime.notaZana = vote.score; // Adiciona a nota da Zana

            if (vote.comment && vote.comment.trim()) {
              allComments.push(`${personName}: ${vote.comment.trim()}`);
              finalAnime.comments.push({
                person: personName,
                text: vote.comment.trim()
              });
            }
          }
        }

        finalAnime.comentarios = allComments.join("\n");

        if (scoreCount > 0) {
          finalAnime.nota = (totalScore / scoreCount).toFixed(2);
          finalAnime.notaSort = parseFloat(finalAnime.nota);
        } else {
          finalAnime.nota = null;
          finalAnime.notaSort = 0;
        }

        finalAnime.qtdVotos = scoreCount; // Quantidade de votos válidos (quem assistiu e deu nota)
        // A controvérsia e maisDeUmVoto podem ser calculados aqui se necessário, ou deixados para a GitHub Action de exportação

        // Adiciona ao batch para escrita na coleção 'animes'
        batch.set(animesRef.doc(animeId), finalAnime);
        // Remove o anime da fila de pendentes
        batch.delete(doc.ref);
        approvedCount++;
      } else {
        console.log(`Anime ${animeData.nome} (ID: ${animeId}) ainda não tem todos os votos ou está incompleto. Ignorando por enquanto.`);
      }
    }

    if (approvedCount > 0) {
      await batch.commit();
      console.log(`Aprovados e movidos ${approvedCount} animes para a coleção 'animes'.`);
    } else {
      console.log("Nenhum anime pendente para aprovar nesta execução.");
    }

    // 2. Exportar todos os animes (aprovados + existentes) para animes.json
    const allAnimesSnapshot = await animesRef.get();
    const animesDataForJson = [];
    let totalAnimesInCollection = 0;

    for (const doc of allAnimesSnapshot.docs) {
      const anime = doc.data();
      // Adiciona 'id' que pode ter sido perdido na exportação do Firestore se não for explicitamente salvo
      anime.id = doc.id;
      animesDataForJson.push(anime);
      totalAnimesInCollection++;
    }

    // Ordena os animes para o JSON
    animesDataForJson.sort((a, b) => (b.notaSort || 0) - (a.notaSort || 0));

    const outputJson = {
      updatedAt: new Date().toISOString(),
      total: totalAnimesInCollection,
      animes: animesDataForJson,
    };

    const outPath = path.join(__dirname, "../data/animes.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(outputJson, null, 2), "utf8");
    console.log(`Dados exportados para ${outPath}. Total de animes: ${totalAnimesInCollection}`);

    // 3. Atualizar metadados (opcional, mas bom para rastreamento)
    await metadataRef.set({
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      total: totalAnimesInCollection,
    });
    console.log("Metadados atualizados.");

    console.log("Processo concluído com sucesso!");

  } catch (error) {
    console.error("Erro durante o processo de aprovação e exportação:", error);
    throw error; // Re-lança o erro para que o GitHub Actions capture falhas
  }
}

exportAndApproveAnimes().catch(console.error);
