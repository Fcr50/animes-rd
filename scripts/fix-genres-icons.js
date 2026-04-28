const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Mapeamento oficial de Gênero Limpo -> Gênero com Emoji
const PRETTY_GENRES = {
  "Ação": "Ação ⚔️",
  "Aventura": "Aventura 🎒",
  "Comédia": "Comédia 😂",
  "Drama": "Drama 😢",
  "Fantasia": "Fantasia 🧙",
  "Terror": "Terror 👻",
  "Shounen" : "Shounen 💥",
  "Mistério": "Mistério 🔍",
  "Romance": "Romance 💖",
  "Ficção Científica": "Ficção Científica 🚀",
  "Slice of Life": "Slice of Life 🍃",
  "Esportes": "Esportes ⚽",
  "Sobrenatural": "Sobrenatural 👻",
  "Psicológico": "Psicológico 🧠",
  "Ecchi": "Ecchi 🔥",
  "Mecha": "Mecha 🤖",
  "Música": "Música 🎵",
  "Histórico": "Histórico 📜",
  "Militar": "Militar 🎖️",
  "Magia": "Magia 🪄",
  "Artes Marciais": "Artes Marciais 🥋",
  "Vampiro": "Vampiro 🧛",
  "Demônios": "Demônios 😈",
  "Escola": "Escola 🏫",
  "Espaço": "Espaço 👨‍🚀",
  "Samurai": "Samurai ⚔️",
  "Policial": "Policial 👮",
  "Harém": "Harém 👫",
  "Jogo": "Jogo 🎮",
  "Paródia": "Paródia 🤡",
  "Isekai": "Isekai 🌍✨",
  "Suspense": "Suspense 😱",
  "Culinária": "Culinária 🍳",
  "Experimental": "Experimental 🧪",
  "Premiado": "Premiado 🏆",
  "BL": "BL 👬",
  "GL": "GL 👭",
  "Hentai": "Hentai 💦",
  "Bomba": "Bomba 💣"
};

const cleanStr = (s) => s.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2702}-\u{27B0}]/gu, "").trim();

async function fixGenres() {
  console.log("Iniciando correção de ícones nos gêneros...");
  const snapshot = await db.collection("animes").get();
  
  const batch = db.batch();
  let count = 0;

  snapshot.forEach(doc => {
    const data = doc.data();
    const originalGenres = data.generos || [];
    
    // Cria nova lista de gêneros padronizada
    const fixedGenres = originalGenres.map(g => {
        const cleaned = cleanStr(g);
        return PRETTY_GENRES[cleaned] || g; // Usa a versão "bonita" ou mantém o original
    });

    // Verifica se houve mudança real (comparando as strings das listas)
    if (JSON.stringify(originalGenres) !== JSON.stringify(fixedGenres)) {
      console.log(`Atualizando: ${data.nome}`);
      batch.update(doc.ref, { generos: fixedGenres });
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
    console.log(`Sucesso! ${count} animes foram atualizados com novos ícones.`);
  } else {
    console.log("Todos os animes já estão com os ícones corretos.");
  }
}

fixGenres().catch(console.error);
