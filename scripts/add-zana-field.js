const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addZanaField() {
  console.log("Iniciando verificação do campo 'notaZana'...");
  const snapshot = await db.collection("animes").get();
  
  const batch = db.batch();
  let count = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    
    // Verifica se o campo notaZana NÃO existe
    if (data.notaZana === undefined) {
      console.log(`Adicionando 'notaZana: null' para: ${data.nome}`);
      batch.update(doc.ref, { notaZana: null });
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
    console.log(`
Sucesso! ${count} animes foram atualizados com o campo 'notaZana'.`);
  } else {
    console.log("Todos os animes já possuem o campo 'notaZana'. Nenhuma atualização necessária.");
  }
}

addZanaField().catch(console.error);
