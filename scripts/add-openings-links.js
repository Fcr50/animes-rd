const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function updateOpeningsToStandardSearch() {
  console.log("Iniciando padronização dos links de opening para: Nome + Opening 1...");
  const snapshot = await db.collection("animes").get();
  
  let count = 0;
  const batch = db.batch();

  snapshot.forEach(doc => {
    const data = doc.data();
    const files = data.files || [];

    // Filtra os arquivos que NÃO são openings para preservar outros links (se houver)
    const otherFiles = files.filter(file => !/opening|op\b/i.test(file.name || ""));

    // Cria o novo link padrão de busca
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(data.nome + " opening 1")}`;

    const newFiles = [
      ...otherFiles,
      {
        name: "Opening 1",
        url: searchUrl
      }
    ];

    // Adiciona ao batch para atualização
    batch.update(doc.ref, { files: newFiles });
    count++;

    // O Firestore limita batches em 500 operações. Como temos ~170 animes, um único batch resolve.
  });

  if (count > 0) {
    await batch.commit();
    console.log(`\nSucesso! ${count} animes foram atualizados com o link de busca padrão.`);
  } else {
    console.log("Nenhum anime encontrado para atualizar.");
  }
}

updateOpeningsToStandardSearch().catch(console.error);
