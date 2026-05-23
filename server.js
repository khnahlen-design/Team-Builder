const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, "courtcrew-db.json");
const DB_BACKUP_FILE = path.join(ROOT, "courtcrew-db.backup.json");
const PLAYER_RATINGS_FILE = path.join(ROOT, "courtcrew-player-ratings.json");
const MAX_PLAYERS = 200;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png"
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const defaultRatingTopics = [
  { key: "serving", label: "Serving" },
  { key: "passing", label: "Passing" },
  { key: "setting", label: "Setting" },
  { key: "hitting", label: "Hitting" },
  { key: "defense", label: "Defense" },
  { key: "gameSense", label: "Game IQ" }
];
const defaultSports = [
  { key: "volleyball", label: "Volleyball" }
];

function newId() {
  return crypto.randomUUID();
}

function demoPlayer(name, status, grade, contact, ratings, notes, gender) {
  return {
    id: newId(),
    name,
    status,
    grade,
    contact,
    gender,
    attendance: "playing",
    savedAt: new Date().toISOString(),
    notes,
    ratings: {
      serving: ratings[0],
      passing: ratings[1],
      setting: ratings[2],
      hitting: ratings[3],
      defense: ratings[4],
      gameSense: ratings[5]
    }
  };
}

function defaultDb() {
  const players = [
    demoPlayer("Maya Johnson", "pending", "8", "555-0101", [5, 4, 4, 5, 4, 5], "Strong all-around player.", "female"),
    demoPlayer("Noah Chen", "pending", "7", "555-0102", [3, 4, 2, 3, 4, 3], "Great passer.", "male"),
    demoPlayer("Ava Patel", "pending", "9", "555-0103", [4, 3, 5, 3, 4, 4], "Likes setting.", "female")
  ];

  return {
    ratingTopics: defaultRatingTopics,
    teamHistory: {},
    players,
    sportsList: defaultSports,
    sports: {
      volleyball: {
        ratingTopics: defaultRatingTopics,
        teamHistory: {},
        players
      }
    }
  };
}

function normalizeTopics(topics) {
  const cleaned = (topics || [])
    .map((topic) => ({
      key: String(topic.key || "").trim(),
      label: String(topic.label || "").trim()
    }))
    .filter((topic) => topic.key && topic.label);

  return cleaned.length ? cleaned : defaultRatingTopics;
}

function normalizeTeamHistory(history) {
  return Object.fromEntries(
    Object.entries(history || {})
      .map(([key, value]) => {
        if (typeof value === "number") {
          return [String(key), { streak: Math.max(0, value), cooldown: value >= 2 ? 3 : 0 }];
        }

        return [String(key), {
          streak: Math.max(0, Number(value?.streak) || 0),
          cooldown: Math.max(0, Number(value?.cooldown) || 0)
        }];
      })
      .filter(([key, value]) => key.includes("::") && (value.streak > 0 || value.cooldown > 0))
  );
}

function normalizeSportKey(sport) {
  const key = String(sport || "volleyball")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  return key || "volleyball";
}

function labelFromSportKey(key) {
  return String(key || "Sport")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeSportsList(sportsList, sportsMap = null) {
  return defaultSports;
}

function emptySportState() {
  return {
    ratingTopics: defaultRatingTopics,
    teamHistory: {},
    players: []
  };
}

function ensureSports(db) {
  if (!db.sports) {
    db.sports = {
      volleyball: {
        ratingTopics: normalizeTopics(db.ratingTopics),
        teamHistory: normalizeTeamHistory(db.teamHistory),
        players: db.players || []
      }
    };
  }
  db.sportsList = normalizeSportsList(db.sportsList, db.sports);
}

function getSportState(db, sport) {
  ensureSports(db);
  if (!db.sports[sport]) db.sports[sport] = emptySportState();

  db.sports[sport].ratingTopics = normalizeTopics(db.sports[sport].ratingTopics);
  db.sports[sport].teamHistory = normalizeTeamHistory(db.sports[sport].teamHistory);
  db.sports[sport].players = (db.sports[sport].players || []).map(normalizePlayer);
  return db.sports[sport];
}

function syncLegacyVolleyball(db) {
  if (!db.sports?.volleyball) return;
  db.ratingTopics = db.sports.volleyball.ratingTopics;
  db.teamHistory = db.sports.volleyball.teamHistory;
  db.players = db.sports.volleyball.players;
}

function readDb() {
  if (!fs.existsSync(DB_FILE)) {
    const db = defaultDb();
    writeDb(db);
    return db;
  }

  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  fs.writeFileSync(DB_BACKUP_FILE, JSON.stringify({
    backedUpAt: new Date().toISOString(),
    ...db
  }, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizePlayer(player) {
  const ratings = player.ratings || {};
  const gender = player.gender === "boy"
    ? "male"
    : player.gender === "girl"
      ? "female"
      : player.gender;
  return {
    id: player.id || newId(),
    name: String(player.name || "").trim(),
    notes: player.notes || "",
    gender: gender === "male" || gender === "female" ? gender : "",
    attendance: player.attendance === "away" ? "away" : "playing",
    savedAt: player.savedAt || new Date().toISOString(),
    ratings: Object.fromEntries(
      Object.entries(ratings).map(([key, value]) => [key, Number(value || 3)])
    )
  };
}

function playerRatingRecord(player) {
  return {
    id: player.id,
    name: player.name,
    notes: player.notes || "",
    gender: player.gender || "",
    attendance: player.attendance || "playing",
    savedAt: player.savedAt || new Date().toISOString(),
    ratings: { ...player.ratings }
  };
}

function readPlayerRatingsFile() {
  if (!fs.existsSync(PLAYER_RATINGS_FILE)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(PLAYER_RATINGS_FILE, "utf8"));
    return (parsed.players || []).map(normalizePlayer).slice(0, MAX_PLAYERS);
  } catch {
    return [];
  }
}

function writePlayerRatingsFile(players) {
  fs.writeFileSync(PLAYER_RATINGS_FILE, JSON.stringify({
    updatedAt: new Date().toISOString(),
    players: players.map(playerRatingRecord)
  }, null, 2));
}

function mergePlayerRatingsFile(players) {
  const savedRatings = readPlayerRatingsFile();
  if (!players.length) return savedRatings.slice(0, MAX_PLAYERS);

  const byId = new Map(savedRatings.map((player) => [player.id, player]));
  const byName = new Map(savedRatings.map((player) => [player.name.trim().toLowerCase(), player]));

  return players.map((player) => {
    const saved = byId.get(player.id) || byName.get(player.name.trim().toLowerCase());
    if (!saved) return player;
    return normalizePlayer({
      ...player,
      ...saved,
      ratings: { ...player.ratings, ...saved.ratings },
      notes: saved.notes || player.notes,
      gender: saved.gender || player.gender,
      attendance: saved.attendance || player.attendance,
      savedAt: saved.savedAt || player.savedAt
    });
  }).slice(0, MAX_PLAYERS);
}

async function handleApi(req, res, url) {
  const db = readDb();
  const sport = normalizeSportKey(url.searchParams.get("sport"));
  const sportState = getSportState(db, sport);

  if (req.method === "GET" && url.pathname === "/api/state") {
    sportState.players = mergePlayerRatingsFile(sportState.players);
    sendJson(res, 200, { ...sportState, sport, sportsList: db.sportsList });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/sports") {
    const body = await parseBody(req);
    db.sportsList = normalizeSportsList(body.sportsList, db.sports);
    db.sportsList.forEach((item) => {
      if (!db.sports[item.key]) db.sports[item.key] = emptySportState();
    });
    syncLegacyVolleyball(db);
    writeDb(db);
    sendJson(res, 200, db.sportsList);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/players") {
    const body = await parseBody(req);
    sportState.players = (body.players || []).map(normalizePlayer).slice(0, MAX_PLAYERS);
    writePlayerRatingsFile(sportState.players);
    syncLegacyVolleyball(db);
    writeDb(db);
    sendJson(res, 200, sportState.players);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/topics") {
    const body = await parseBody(req);
    sportState.ratingTopics = normalizeTopics(body.ratingTopics);
    syncLegacyVolleyball(db);
    writeDb(db);
    sendJson(res, 200, sportState.ratingTopics);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/team-history") {
    const body = await parseBody(req);
    sportState.teamHistory = normalizeTeamHistory(body.teamHistory);
    syncLegacyVolleyball(db);
    writeDb(db);
    sendJson(res, 200, sportState.teamHistory);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function serveFile(req, res, url) {
  let filePath = path.join(ROOT, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch(() => {
      sendJson(res, 500, { error: "Server error" });
    });
    return;
  }
  serveFile(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`CourtCrew running at http://${HOST}:${PORT}`);
});
