const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Carrega o service account key. 
// Você deve baixar este arquivo do console do Firebase:
// Configurações do Projeto > Contas de Serviço > Gerar nova chave privada
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrate() {
  const dataPath = path.join(__dirname, "../data/animes.json");
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  
  const { animes } = data;
  console.log(`Iniciando migração de ${animes.length} animes...`);

  const batch = db.batch();
  const collectionRef = db.collection("animes");

  // O Firestore tem um limite de 500 operações por batch
  // Como temos ~175 animes, um único batch é suficiente.
  animes.forEach((anime) => {
    // Usamos o ID do Notion como ID do documento no Firestore para manter consistência
    const docRef = collectionRef.doc(anime.id);
    batch.set(docRef, {
      ...anime,
      migratedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  console.log("Migração concluída com sucesso!");

  // Opcional: Salvar o updatedAt global em um documento de metadados
  await db.collection("metadata").doc("stats").set({
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    total: animes.length
  });
}

migrate().catch(console.error);
