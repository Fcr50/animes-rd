const admin = require("firebase-admin");

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} else {
  try {
    serviceAccount = require("./serviceAccountKey.json");
  } catch {
    console.error("Credenciais não encontradas. Configure FIREBASE_SERVICE_ACCOUNT_KEY ou crie serviceAccountKey.json");
    process.exit(1);
  }
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function searchJikan(name) {
  const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(name)}&limit=1`;
  const res = await fetch(url);
  if (res.status === 429) {
    console.log("  Rate limited, aguardando 2s...");
    await sleep(2000);
    return searchJikan(name);
  }
  if (!res.ok) throw new Error(`Jikan error ${res.status}`);
  const data = await res.json();
  return data.data?.[0] || null;
}

async function migrateMalIds() {
  const animesRef = db.collection("animes");
  const snapshot = await animesRef.get();

  const semMalId = snapshot.docs.filter(d => !d.data().malId);
  console.log(`Total de animes: ${snapshot.size} | Sem malId: ${semMalId.length}`);

  let atualizados = 0, naoEncontrados = 0;

  for (const docSnap of semMalId) {
    const anime = docSnap.data();
    console.log(`\nBuscando: ${anime.nome}`);

    try {
      const result = await searchJikan(anime.nome);
      if (result) {
        const officialTitle = result.title_english || result.title;
        await docSnap.ref.update({ malId: result.mal_id });
        console.log(`  ✓ malId ${result.mal_id} — ${officialTitle}`);
        atualizados++;
      } else {
        console.log(`  ✗ Não encontrado no Jikan`);
        naoEncontrados++;
      }
    } catch (err) {
      console.error(`  Erro: ${err.message}`);
      naoEncontrados++;
    }

    // Respeita o rate limit da Jikan (3 req/s)
    await sleep(400);
  }

  console.log(`\nConcluído. Atualizados: ${atualizados} | Não encontrados: ${naoEncontrados}`);
  process.exit(0);
}

migrateMalIds().catch(err => { console.error(err); process.exit(1); });
