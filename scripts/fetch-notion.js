const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

function getText(prop) {
  if (!prop) return "";
  if (prop.type === "title") return prop.title.map((t) => t.plain_text).join("");
  if (prop.type === "rich_text") return prop.rich_text.map((t) => t.plain_text).join("");
  return "";
}

function getNumber(prop) {
  if (!prop || prop.type !== "number") return null;
  return prop.number;
}

function getFormula(prop) {
  if (!prop || prop.type !== "formula") return null;
  const f = prop.formula;
  if (f.type === "number") return f.number;
  if (f.type === "string") return f.string;
  return null;
}

function getMultiSelect(prop) {
  if (!prop || prop.type !== "multi_select") return [];
  return prop.multi_select.map((s) => s.name);
}

function getFiles(prop) {
  if (!prop || prop.type !== "files") return [];
  return prop.files.map((f) => {
    if (f.type === "external") return { name: f.name, url: f.external.url };
    if (f.type === "file") return { name: f.name, url: f.file.url };
    return null;
  }).filter(Boolean);
}

const PEOPLE = ["Rafael", "Fernando", "Dudu", "Hacksuya"];

function normalizeName(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseNamedComments(text) {
  if (!text) return [];
  const peoplePattern = PEOPLE.join("|");
  const linePattern = new RegExp(`^\\s*(${peoplePattern})\\s*[:\\-–—]\\s*(.+)$`, "i");

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(linePattern);
      if (!match) return null;
      const person = PEOPLE.find((p) => normalizeName(p) === normalizeName(match[1]));
      return person ? { person, text: match[2].trim() } : null;
    })
    .filter(Boolean);
}

function getComments(properties) {
  const comments = [];

  for (const [name, prop] of Object.entries(properties)) {
    if (!normalizeName(name).includes("coment")) continue;

    const text = getText(prop).trim();
    if (!text) continue;

    const person = PEOPLE.find((p) => normalizeName(name).includes(normalizeName(p)));
    if (person) {
      comments.push({ person, text });
      continue;
    }

    comments.push(...parseNamedComments(text));
  }

  return comments;
}

async function fetchAllPages() {
  const results = [];
  let cursor = undefined;

  do {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      start_cursor: cursor,
      page_size: 100,
    });

    results.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return results;
}

async function main() {
  console.log("Fetching Notion database...");
  const pages = await fetchAllPages();
  console.log(`Found ${pages.length} entries.`);

  const animes = pages.map((page) => {
    const p = page.properties;
    return {
      id: page.id,
      nome: getText(p["Anime 🎬"]),
      quemAssistiu: getMultiSelect(p["Quem já assistiu 👥"]),
      nota: getFormula(p["Nota ⭐"]),
      generos: getMultiSelect(p["🎭 Gênero"]),
      comentarios: getText(p["Comentários 💬"]),
      comments: getComments(p),
      files: getFiles(p["Files & media"]),
      notaRafael: getNumber(p["Nota Rafael ⭐"]),
      notaFernando: getNumber(p["Nota Fernando ⭐"]),
      notaDudu: getNumber(p["Nota Dudu ⭐"]),
      notaHacksuya: getNumber(p["Nota Hacksuya ⭐"]),
      maisDeUmVoto: getFormula(p["2+ Votos ✅"]),
      qtdVotos: getFormula(p["Qtd. Votos 🗳️"]),
      notaSort: getFormula(p["_Nota Sort"]),
      controversia: getFormula(p["🌶️ Controvérsia"]),
    };
  }).filter((a) => a.nome);

  animes.sort((a, b) => (b.notaSort || 0) - (a.notaSort || 0));

  const output = {
    updatedAt: new Date().toISOString(),
    total: animes.length,
    animes,
  };

  const outPath = path.join(__dirname, "../data/animes.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`Saved to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
