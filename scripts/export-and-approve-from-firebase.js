const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Use a chave de serviço do Firebase, que deve estar como secret no GitHub Actions
// Certifique-se de que o arquivo 'serviceAccountKey.json' esteja acessível ou que as credenciais estejam configuradas corretamente para o ambiente do GitHub Actions.

// **IMPORTANTE:** No GitHub Actions, o secret `FIREBASE_SERVICE_ACCOUNT_KEY` conterá o JSON completo.
// Para rodar localmente, você precisará criar um arquivo `scripts/serviceAccountKey.json` manualmente.
let serviceAccount;
if (process.env.NODE_ENV === "production") { // Ambiente GitHub Actions
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} else { // Ambiente local
  serviceAccount = require("./serviceAccountKey.json");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const PEOPLE = ["Rafael", "Fernando", "Dudu", "Hacksuya"];

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

    for (const doc of pendingAnimesSnapshot.docs) {
      const animeId = doc.id;
      const animeData = doc.data();

      // Verifica se todos votaram
      if (animeData.votedUserIds && animeData.votedUserIds.length === PEOPLE.length) {
        console.log(`Processando anime pendente: ${animeData.nome} (ID: ${animeId})`);

        // Prepara os dados para a coleção 'animes'
        const finalAnime = {
          id: animeId, // Mantém o ID original
          nome: animeData.nome,
          generos: animeData.generos,
          comentarios: "", // Inicializa campos que podem não existir se ninguém votou 'Assisti'
          files: [],
          maisDeUmVoto: "nao",
          qtdVotos: 0,
          controversia: 0,
          notaSort: 0,
          notaRafael: null,
          notaFernando: null,
          notaDudu: null,
          notaHacksuya: null,
          quemAssistiu: [],
        };

        let totalScore = 0;
        let scoreCount = 0;

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

            // Guarda o primeiro comentário encontrado para o anime (pode ser refinado)
            if (!finalAnime.comentarios && vote.comment) {
              finalAnime.comentarios = vote.comment;
            }
          }
        }

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
