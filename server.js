const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, "courtcrew-db.json");

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
  return {
    ratingTopics: defaultRatingTopics,
    players: [
      demoPlayer("Maya Johnson", "pending", "8", "555-0101", [5, 4, 4, 5, 4, 5], "Strong all-around player.", "female"),
      demoPlayer("Noah Chen", "pending", "7", "555-0102", [3, 4, 2, 3, 4, 3], "Great passer.", "male"),
      demoPlayer("Ava Patel", "pending", "9", "555-0103", [4, 3, 5, 3, 4, 4], "Likes setting.", "female")
    ]
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

async function handleApi(req, res, url) {
  const db = readDb();

  if (req.method === "GET" && url.pathname === "/api/state") {
    db.ratingTopics = normalizeTopics(db.ratingTopics);
    sendJson(res, 200, db);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/players") {
    const body = await parseBody(req);
    db.players = (body.players || []).map(normalizePlayer);
    writeDb(db);
    sendJson(res, 200, db.players);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/topics") {
    const body = await parseBody(req);
    db.ratingTopics = normalizeTopics(body.ratingTopics);
    writeDb(db);
    sendJson(res, 200, db.ratingTopics);
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
