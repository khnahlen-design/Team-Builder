const STORAGE_KEY = "courtcrew-team-roster-v1";
const PLAYER_RATINGS_KEY = "courtcrew-player-ratings-file-v1";
const TOPICS_KEY = "courtcrew-rating-topics-v1";
const TEAM_HISTORY_KEY = "courtcrew-team-pair-history-v1";
const ACTIVE_SPORT_KEY = "courtcrew-active-sport-v1";
const SPORTS_KEY = "courtcrew-sports-v1";
const MAX_PLAYERS = 200;
const API_BASE = location.protocol === "file:" ? "http://127.0.0.1:4176" : "";
const API_ENABLED = true;
const defaultSports = [
  { key: "volleyball", label: "Volleyball" }
];
let sports = defaultSports;
let activeSport = "volleyball";
localStorage.setItem(ACTIVE_SPORT_KEY, activeSport);
localStorage.setItem(SPORTS_KEY, JSON.stringify(defaultSports));

const defaultRatingTopics = [
  { key: "serving", label: "Serving" },
  { key: "passing", label: "Passing" },
  { key: "setting", label: "Setting" },
  { key: "hitting", label: "Hitting" },
  { key: "defense", label: "Defense" },
  { key: "gameSense", label: "Game IQ" }
];

let skills = loadRatingTopics();

const demoPlayers = [
  player("Maya Johnson", [5, 4, 4, 5, 4, 5], "Strong all-around player.", "female"),
  player("Noah Chen", [3, 4, 2, 3, 4, 3], "Great passer.", "male"),
  player("Ava Patel", [4, 3, 5, 3, 4, 4], "Likes setting.", "female"),
  player("Eli Thompson", [2, 3, 2, 2, 3, 2], "Newer player, very coachable.", "male"),
  player("Sofia Garcia", [5, 5, 4, 4, 5, 5], "Excellent court awareness.", "female"),
  player("Lucas Brown", [3, 2, 2, 4, 3, 3], "Big hitter.", "male"),
  player("Grace Wilson", [4, 4, 3, 3, 5, 4], "Reliable defender.", "female"),
  player("Isaac Lee", [5, 3, 3, 5, 3, 4], "Powerful serve.", "male")
];

let hasSavedRoster = false;
let roster = loadRoster();
let generatedTeams = [];
let isAdmin = true;
let pairHistory = loadPairHistory();
let ratingAutosaveTimer = null;

const form = document.querySelector("#playerForm");
const skillsForm = document.querySelector("#skillsForm");
const playerList = document.querySelector("#playerList");
const teamsGrid = document.querySelector("#teamsGrid");
const saveStatus = document.querySelector("#saveStatus");
const rosterLimitStatus = document.querySelector("#rosterLimitStatus");
const topicForm = document.querySelector("#topicForm");
const topicName = document.querySelector("#topicName");
const ratingTopicList = document.querySelector("#ratingTopicList");
const sportTabs = document.querySelector("#sportTabs");
const sportForm = document.querySelector("#sportForm");
const sportName = document.querySelector("#sportName");
const sportList = document.querySelector("#sportList");

function player(name, ratings, notes = "", gender = "") {
  return {
    id: crypto.randomUUID(),
    name,
    notes,
    gender,
    attendance: "playing",
    ratings: Object.fromEntries(skills.map((skill, index) => [skill.key, ratings[index] || 3]))
  };
}

function normalizeGender(gender) {
  if (gender === "male" || gender === "boy") return "male";
  if (gender === "female" || gender === "girl") return "female";
  return "";
}

function ratingForSkill(person, skill) {
  const ratings = person.ratings || {};
  const legacyKey = skill.key === "gameSense" ? "game-iq" : skill.key;
  return Number(ratings[skill.key] ?? ratings[legacyKey] ?? 3);
}

function normalizePlayer(person) {
  const ratings = {};
  skills.forEach((skill) => {
    ratings[skill.key] = ratingForSkill(person, skill);
  });

  return {
    id: person.id || crypto.randomUUID(),
    name: person.name || "",
    notes: person.notes || "",
    gender: normalizeGender(person.gender),
    attendance: person.attendance === "away" ? "away" : "playing",
    savedAt: person.savedAt || "",
    ratings
  };
}

function playerRatingRecord(person) {
  return {
    id: person.id,
    name: person.name,
    notes: person.notes || "",
    gender: person.gender || "",
    attendance: person.attendance || "playing",
    savedAt: person.savedAt || new Date().toISOString(),
    ratings: { ...person.ratings }
  };
}

function loadPlayerRatingsFile() {
  try {
    const saved = localStorage.getItem(PLAYER_RATINGS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    const players = Array.isArray(parsed) ? parsed : parsed.players;
    return (players || []).map(normalizePlayer).slice(0, MAX_PLAYERS);
  } catch {
    return [];
  }
}

function savePlayerRatingsFile(players = roster) {
  localStorage.setItem(PLAYER_RATINGS_KEY, JSON.stringify({
    updatedAt: new Date().toISOString(),
    players: players.slice(0, MAX_PLAYERS).map(playerRatingRecord)
  }));
}

function apiUrl(path) {
  return `${API_BASE}${path}?sport=${encodeURIComponent(activeSport)}`;
}

function normalizeSports(items) {
  return defaultSports;
}

function loadSports() {
  return defaultSports;
}

function saveSportsLocal() {
  localStorage.setItem(SPORTS_KEY, JSON.stringify(defaultSports));
}

function saveSports() {
  saveSportsLocal();
  renderSportTabs();
  renderSportEditor();
  if (!API_ENABLED) return;

  return fetch(apiUrl("/api/sports"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sportsList: sports })
  }).catch(() => {
    console.warn("Sports saved on this device. Server sync failed.");
  });
}

function sportStorageKey(key) {
  return activeSport === "volleyball" ? key : `${key}-${activeSport}`;
}

function activeSportLabel() {
  return sports.find((sport) => sport.key === activeSport)?.label || "Sport";
}

function defaultRosterForSport() {
  return activeSport === "volleyball" ? demoPlayers : [];
}

function updateSportTabs() {
  if (!sportTabs) return;
  sportTabs.querySelectorAll(".sport-tab").forEach((button) => {
    const isActive = button.dataset.sport === activeSport;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderSportTabs() {
  if (!sportTabs) return;
  sportTabs.innerHTML = "";
  sports.forEach((sport) => {
    const button = document.createElement("button");
    button.className = "sport-tab";
    button.type = "button";
    button.dataset.sport = sport.key;
    button.textContent = sport.label;
    sportTabs.appendChild(button);
  });
  updateSportTabs();
}

function renderSportEditor() {
  if (!sportList) return;
  sportList.innerHTML = "";

  sports.forEach((sport) => {
    const row = document.createElement("div");
    row.className = "topic-row";
    const input = document.createElement("input");
    input.type = "text";
    input.value = sport.label;
    input.setAttribute("aria-label", "Sport tab name");

    const saveButton = document.createElement("button");
    saveButton.className = "ghost-button";
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", () => renameSport(sport.key, input.value));

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteSport(sport.key));

    row.append(input, saveButton, deleteButton);
    sportList.appendChild(row);
  });
}

function makeSportKey(label, existingKey = "", extraUsed = null) {
  const base = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "sport";
  let key = base;
  let count = 2;
  const used = extraUsed || new Set(sports.map((sport) => sport.key).filter((keyValue) => keyValue !== existingKey));
  while (used.has(key) && key !== existingKey) {
    key = `${base}-${count}`;
    count += 1;
  }
  return key;
}

async function addSport(label) {
  saveStatus.textContent = "Only the Volleyball roster is active now.";
}

async function renameSport(key, label) {
  const cleanLabel = label.trim();
  if (!cleanLabel) return;

  sports = sports.map((sport) => sport.key === key ? { ...sport, label: cleanLabel } : sport);
  await saveSports();
  updateSportTabs();
  if (key === activeSport) saveStatus.textContent = `${cleanLabel} saved.`;
}

async function deleteSport(key) {
  saveStatus.textContent = "Only the Volleyball roster is active now.";
}

function pairKey(playerA, playerB) {
  return [playerA.id, playerB.id].sort().join("::");
}

function normalizePairHistory(history) {
  return Object.fromEntries(
    Object.entries(history || {})
      .map(([key, value]) => {
        if (typeof value === "number") {
          return [key, { streak: Math.max(0, value), cooldown: value >= 2 ? 3 : 0 }];
        }

        return [key, {
          streak: Math.max(0, Number(value?.streak) || 0),
          cooldown: Math.max(0, Number(value?.cooldown) || 0)
        }];
      })
      .filter(([, value]) => value.streak > 0 || value.cooldown > 0)
  );
}

function loadPairHistory() {
  try {
    const saved = localStorage.getItem(sportStorageKey(TEAM_HISTORY_KEY));
    return saved ? normalizePairHistory(JSON.parse(saved)) : {};
  } catch {
    return {};
  }
}

function savePairHistoryLocal() {
  localStorage.setItem(sportStorageKey(TEAM_HISTORY_KEY), JSON.stringify(pairHistory));
}

function savePairHistory() {
  savePairHistoryLocal();
  if (!API_ENABLED) return;

  return fetch(apiUrl("/api/team-history"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamHistory: pairHistory })
  }).catch(() => {
    console.warn("Team history saved on this device. Server sync failed.");
  });
}

function teamPairConflictCount(team, person) {
  return team.players.filter((teammate) => {
    const history = pairHistory[pairKey(person, teammate)];
    return history?.cooldown > 0 || history?.streak >= 2;
  }).length;
}

function recordTeamHistory(teams) {
  const nextHistory = {};
  const currentPairs = new Set();

  teams.forEach((team) => {
    team.players.forEach((playerA, index) => {
      team.players.slice(index + 1).forEach((playerB) => {
        const key = pairKey(playerA, playerB);
        const previous = pairHistory[key] || { streak: 0, cooldown: 0 };
        const streak = previous.streak + 1;
        nextHistory[key] = {
          streak,
          cooldown: streak >= 2 ? 3 : 0
        };
        currentPairs.add(key);
      });
    });
  });

  Object.entries(pairHistory).forEach(([key, history]) => {
    if (currentPairs.has(key)) return;

    const cooldown = Math.max(0, Number(history.cooldown) || 0);
    if (cooldown > 1) {
      nextHistory[key] = { streak: 0, cooldown: cooldown - 1 };
    }
  });

  pairHistory = nextHistory;
  savePairHistory();
}

function loadRatingTopics() {
  try {
    const saved = localStorage.getItem(sportStorageKey(TOPICS_KEY));
    return saved ? JSON.parse(saved) : defaultRatingTopics;
  } catch {
    return defaultRatingTopics;
  }
}

function saveRatingTopics() {
  localStorage.setItem(sportStorageKey(TOPICS_KEY), JSON.stringify(skills));
  if (!API_ENABLED) return;

  return fetch(apiUrl("/api/topics"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ratingTopics: skills })
  }).catch(() => {
    console.warn("Rating topics saved on this device. Server sync failed.");
  });
}

function loadRoster() {
  try {
    const saved = localStorage.getItem(sportStorageKey(STORAGE_KEY));
    hasSavedRoster = Boolean(saved);
    if (saved) return JSON.parse(saved).map(normalizePlayer).slice(0, MAX_PLAYERS);
    const ratingBackup = loadPlayerRatingsFile();
    return ratingBackup.length ? ratingBackup : defaultRosterForSport().slice(0, MAX_PLAYERS);
  } catch {
    hasSavedRoster = false;
    const ratingBackup = loadPlayerRatingsFile();
    return ratingBackup.length ? ratingBackup : defaultRosterForSport().slice(0, MAX_PLAYERS);
  }
}

function saveRoster() {
  roster = roster.slice(0, MAX_PLAYERS);
  localStorage.setItem(sportStorageKey(STORAGE_KEY), JSON.stringify(roster));
  savePlayerRatingsFile();
  if (!API_ENABLED) return;

  return fetch(apiUrl("/api/players"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ players: roster.slice(0, MAX_PLAYERS) })
  }).catch(() => {
    console.warn("Saved on this device. Server sync failed.");
  });
}

async function loadSharedState() {
  if (!API_ENABLED) return;

  try {
    const response = await fetch(apiUrl("/api/state"));
    if (!response.ok) throw new Error("Unable to load shared state");
    const state = await response.json();
    if (state.sportsList?.length) {
      sports = normalizeSports(state.sportsList);
      if (!sports.some((sport) => sport.key === activeSport)) {
        activeSport = sports[0].key;
        localStorage.setItem(ACTIVE_SPORT_KEY, activeSport);
      }
      saveSportsLocal();
      renderSportTabs();
      renderSportEditor();
    }
    if (state.ratingTopics?.length) {
      skills = state.ratingTopics;
      localStorage.setItem(sportStorageKey(TOPICS_KEY), JSON.stringify(skills));
      buildSkillsForm();
      renderRatingTopics();
    }
    pairHistory = normalizePairHistory(state.teamHistory || pairHistory);
    savePairHistoryLocal();
    roster = mergeRosters(state.players || [], hasSavedRoster ? roster : []);
    saveLocalOnly();
    saveRoster();
    renderRoster();
    renderTeams();
  } catch {
    console.warn("Using this device's saved roster.");
  }
}

function saveLocalOnly() {
  localStorage.setItem(sportStorageKey(STORAGE_KEY), JSON.stringify(roster));
  savePlayerRatingsFile();
}

function rosterMergeKey(person) {
  return person.name.trim().toLowerCase() || person.id;
}

function mergeRosters(sharedPlayers, savedPlayers) {
  const merged = new Map();

  [...sharedPlayers, ...savedPlayers].map(normalizePlayer).forEach((person) => {
    const key = rosterMergeKey(person);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, person);
      return;
    }

    const personTime = Date.parse(person.savedAt || "") || 0;
    const existingTime = Date.parse(existing.savedAt || "") || 0;
    const personIsNewer = personTime > existingTime;
    const primary = personIsNewer ? person : existing;
    const secondary = personIsNewer ? existing : person;

    merged.set(key, normalizePlayer({
      ...secondary,
      ...primary,
      ratings: { ...secondary.ratings, ...primary.ratings },
      notes: primary.notes || secondary.notes,
      gender: primary.gender || secondary.gender,
      attendance: primary.attendance || secondary.attendance,
      savedAt: primary.savedAt || secondary.savedAt
    }));
  });

  return Array.from(merged.values()).slice(0, MAX_PLAYERS);
}

async function switchSport(sportKey) {
  if (sportKey !== "volleyball" || sportKey === activeSport) return;

  activeSport = sportKey;
  localStorage.setItem(ACTIVE_SPORT_KEY, activeSport);
  skills = loadRatingTopics();
  hasSavedRoster = false;
  roster = loadRoster();
  pairHistory = loadPairHistory();
  generatedTeams = [];
  buildSkillsForm();
  resetForm();
  renderRatingTopics();
  renderRoster();
  renderTeams();
  updateSportTabs();
  saveStatus.textContent = `${activeSportLabel()} loaded.`;
  await loadSharedState();
}

function makeTopicKey(label, existingKey = "") {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "topic";
  let key = base;
  let count = 2;
  const used = new Set(skills.map((topic) => topic.key).filter((keyValue) => keyValue !== existingKey));
  while (used.has(key)) {
    key = `${base}-${count}`;
    count += 1;
  }
  return key;
}

async function persistTopicsAndRoster(message) {
  roster = roster.map(normalizePlayer);
  await saveRatingTopics();
  await saveRoster();
  buildSkillsForm();
  resetForm();
  renderRatingTopics();
  renderRoster();
  renderTeams();
  saveStatus.textContent = message;
}

function renderRatingTopics() {
  ratingTopicList.innerHTML = "";

  skills.forEach((topic, index) => {
    const row = document.createElement("div");
    row.className = "topic-row";
    row.innerHTML = `
      <input type="text" value="${topic.label}" aria-label="Rating topic">
      <button class="ghost-button topic-save" type="button">Save</button>
      <button class="danger-button topic-delete" type="button">Delete</button>
    `;

    row.querySelector(".topic-save").addEventListener("click", () => {
      renameRatingTopic(index, row.querySelector("input").value);
    });
    row.querySelector(".topic-delete").addEventListener("click", () => {
      deleteRatingTopic(index);
    });
    ratingTopicList.appendChild(row);
  });
}

async function addRatingTopic(label) {
  const cleanLabel = label.trim();
  if (!cleanLabel) return;

  const key = makeTopicKey(cleanLabel);
  skills.push({ key, label: cleanLabel });
  roster = roster.map((person) => ({
    ...person,
    ratings: { ...person.ratings, [key]: 3 }
  }));
  topicName.value = "";
  await persistTopicsAndRoster(`${cleanLabel} added to ratings.`);
}

async function renameRatingTopic(index, label) {
  const cleanLabel = label.trim();
  if (!cleanLabel) return;

  const oldTopic = skills[index];
  const newKey = makeTopicKey(cleanLabel, oldTopic.key);
  skills[index] = { key: newKey, label: cleanLabel };

  if (newKey !== oldTopic.key) {
    roster = roster.map((person) => {
      const ratings = { ...person.ratings, [newKey]: Number(person.ratings?.[oldTopic.key] || 3) };
      delete ratings[oldTopic.key];
      return { ...person, ratings };
    });
  }

  await persistTopicsAndRoster(`${cleanLabel} saved.`);
}

async function deleteRatingTopic(index) {
  if (skills.length <= 1) {
    saveStatus.textContent = "Keep at least one rating topic.";
    return;
  }

  const [removed] = skills.splice(index, 1);
  roster = roster.map((person) => {
    const ratings = { ...person.ratings };
    delete ratings[removed.key];
    return { ...person, ratings };
  });
  await persistTopicsAndRoster(`${removed.label} removed from ratings.`);
}

function totalSkill(person) {
  return skills.reduce((sum, skill) => sum + Number(person.ratings?.[skill.key] || 0), 0);
}

function averageSkill(person) {
  return totalSkill(person) / skills.length;
}

function playersByRating(players) {
  const genderOrder = { male: 0, female: 1 };
  return players.slice().sort((a, b) => {
    const genderRank = (genderOrder[a.gender] ?? 3) - (genderOrder[b.gender] ?? 3);
    if (genderRank !== 0) return genderRank;
    return averageSkill(b) - averageSkill(a) || a.name.localeCompare(b.name);
  });
}

function genderLabel(gender) {
  if (gender === "female") return "Female";
  if (gender === "male") return "Male";
  return "";
}

function genderCount(team, gender) {
  if (!gender) return 0;
  return team.players.filter((person) => person.gender === gender).length;
}

function teamGenderSummary(team) {
  const females = genderCount(team, "female");
  const males = genderCount(team, "male");
  if (!females && !males) return "";
  return `${females} female${females === 1 ? "" : "s"} / ${males} male${males === 1 ? "" : "s"}`;
}

function shuffle(items) {
  return items
    .map((item) => ({ item, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

function balancedDraftOrder(players) {
  const groups = {
    female: [],
    male: [],
    unset: []
  };

  players.forEach((person) => {
    const groupKey = person.gender === "male" || person.gender === "female" ? person.gender : "unset";
    groups[groupKey].push(person);
  });

  Object.values(groups).forEach((group) => {
    group.sort((a, b) => totalSkill(b) - totalSkill(a));
  });

  const draftOrder = [];
  const groupOrder = shuffle(["female", "male", "unset"]);
  while (groupOrder.some((groupKey) => groups[groupKey].length)) {
    groupOrder.forEach((groupKey) => {
      const nextPlayer = groups[groupKey].shift();
      if (nextPlayer) draftOrder.push(nextPlayer);
    });
  }

  return draftOrder;
}

function mixedGenderScore(team, person) {
  if (person.gender !== "male" && person.gender !== "female") return 0;

  const males = genderCount(team, "male") + (person.gender === "male" ? 1 : 0);
  const females = genderCount(team, "female") + (person.gender === "female" ? 1 : 0);
  const missingMixPenalty = males > 0 && females > 0 ? 0 : 1;
  return Math.abs(males - females) + missingMixPenalty;
}

function buildSkillsForm() {
  skillsForm.innerHTML = skills.map((skill) => `
    <label class="skill-row">
      <span>${skill.label}</span>
      <input type="range" min="1" max="5" value="3" id="skill-${skill.key}" data-skill="${skill.key}">
      <output for="skill-${skill.key}">3</output>
    </label>
  `).join("");

  skillsForm.querySelectorAll("input[type='range']").forEach((input) => {
    input.addEventListener("input", () => {
      input.nextElementSibling.value = input.value;
      input.nextElementSibling.textContent = input.value;
      queueRatingAutosave(input);
    });
  });
}

function queueRatingAutosave(input) {
  const id = document.querySelector("#playerId").value;
  if (!id) return;

  const person = roster.find((item) => item.id === id);
  if (!person) return;

  person.ratings[input.dataset.skill] = Number(input.value);
  person.savedAt = new Date().toISOString();
  generatedTeams = [];
  saveLocalOnly();
  renderRoster();
  renderTeams();
  saveStatus.textContent = `${person.name} rating saved.`;

  clearTimeout(ratingAutosaveTimer);
  ratingAutosaveTimer = setTimeout(() => {
    saveRoster();
  }, 400);
}

function renderStats() {
  const playing = roster.filter((person) => person.attendance !== "away");
  const average = roster.length
    ? roster.reduce((sum, person) => sum + averageSkill(person), 0) / roster.length
    : 0;

  document.querySelector("#playerCount").textContent = `${playing.length}/${roster.length}`;
  document.querySelector("#averageSkill").textContent = average.toFixed(1);
  document.querySelector("#teamCountStat").textContent = generatedTeams.length || document.querySelector("#teamCount").value;
  if (rosterLimitStatus) {
    rosterLimitStatus.textContent = `Roster saves ${roster.length} of ${MAX_PLAYERS} players.`;
  }
}

function setBuilderMode() {
  isAdmin = true;
  document.body.classList.add("is-admin");
  renderRoster();
  renderTeams();
}

function renderRoster() {
  playerList.innerHTML = "";

  if (!roster.length) {
    playerList.innerHTML = `<div class="empty-state">Add players to start building teams.</div>`;
    renderStats();
    return;
  }

  const template = document.querySelector("#playerCardTemplate");
  roster
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((person) => {
      const node = template.content.cloneNode(true);
      const card = node.querySelector(".player-card");
      const score = averageSkill(person);
      const isPlaying = person.attendance !== "away";
      card.querySelector("h4").textContent = person.name;
      card.querySelector("p").textContent = isAdmin ? `Skill ${score.toFixed(1)} of 5` : "Player saved";
      const attendancePill = card.querySelector(".attendance-pill");
      attendancePill.textContent = isPlaying ? "Playing" : "Not playing";
      attendancePill.classList.add(isPlaying ? "attendance-playing-pill" : "attendance-away-pill");
      const genderPill = card.querySelector(".gender-pill");
      if (person.gender === "male" || person.gender === "female") {
        genderPill.textContent = genderLabel(person.gender);
        genderPill.classList.add(`gender-${person.gender}-pill`);
      } else {
        genderPill.hidden = true;
      }
      card.querySelector(".skill-meter span").style.width = `${(score / 5) * 100}%`;
      card.querySelector(".player-meta").textContent = isAdmin ? person.notes || "" : "";
      const playingButton = card.querySelector(".attendance-playing");
      const awayButton = card.querySelector(".attendance-away");
      playingButton.classList.toggle("active-attendance", isPlaying);
      awayButton.classList.toggle("active-attendance", !isPlaying);
      playingButton.setAttribute("aria-pressed", String(isPlaying));
      awayButton.setAttribute("aria-pressed", String(!isPlaying));
      playingButton.addEventListener("click", () => setAttendance(person.id, "playing"));
      awayButton.addEventListener("click", () => setAttendance(person.id, "away"));
      card.querySelector(".edit-player").addEventListener("click", () => editPlayer(person.id));
      const deleteButton = card.querySelector(".delete-player");
      deleteButton.hidden = !isAdmin;
      deleteButton.addEventListener("click", () => deletePlayer(person.id));
      playerList.appendChild(node);
    });

  renderStats();
}

function resetForm() {
  form.reset();
  document.querySelector("#playerId").value = "";
  document.querySelector("#playerGender").value = "male";
  skills.forEach((skill) => {
    const input = document.querySelector(`#skill-${skill.key}`);
    input.value = 3;
    input.nextElementSibling.value = 3;
    input.nextElementSibling.textContent = "3";
  });
}

function readForm() {
  const id = document.querySelector("#playerId").value || crypto.randomUUID();
  const existing = roster.find((item) => item.id === id);
  const ratings = {};

  if (isAdmin) {
    skills.forEach((skill) => {
      ratings[skill.key] = Number(document.querySelector(`#skill-${skill.key}`).value);
    });
  } else {
    skills.forEach((skill) => {
      ratings[skill.key] = Number(existing?.ratings?.[skill.key] || 3);
    });
  }

  return {
    id,
    name: document.querySelector("#playerName").value.trim(),
    gender: document.querySelector("#playerGender").value,
    notes: isAdmin ? document.querySelector("#playerNotes").value.trim() : existing?.notes || "",
    attendance: existing?.attendance || "playing",
    savedAt: new Date().toISOString(),
    ratings
  };
}

function editPlayer(id) {
  const person = roster.find((item) => item.id === id);
  if (!person) return;

  document.querySelector("#playerId").value = person.id;
  document.querySelector("#playerName").value = person.name;
  document.querySelector("#playerGender").value = person.gender === "female" ? "female" : "male";
  document.querySelector("#playerNotes").value = person.notes || "";

  skills.forEach((skill) => {
    const input = document.querySelector(`#skill-${skill.key}`);
    const value = person.ratings[skill.key] || 3;
    input.value = value;
    input.nextElementSibling.value = value;
    input.nextElementSibling.textContent = value;
  });

  document.querySelector("#playerName").focus();
}

function deletePlayer(id) {
  roster = roster.filter((person) => person.id !== id);
  generatedTeams = [];
  saveRoster();
  renderRoster();
  renderTeams();
}

function setAttendance(id, attendance) {
  roster = roster.map((person) => {
    if (person.id !== id) return person;
    return { ...person, attendance };
  });
  generatedTeams = [];
  saveRoster();
  renderRoster();
  renderTeams();
  saveStatus.textContent = `Attendance saved: ${attendance === "away" ? "Not playing" : "Playing"}.`;
}

function makeTeams() {
  const teamCount = Math.max(2, Math.min(10, Number(document.querySelector("#teamCount").value) || 2));
  const names = document.querySelector("#teamNames").value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  const teams = Array.from({ length: teamCount }, (_, index) => ({
    name: names[index] || `Team ${index + 1}`,
    players: [],
    score: 0
  }));

  const playingRoster = roster
    .filter((person) => person.attendance !== "away")
    .slice();
  const maxTeamSize = Math.ceil(playingRoster.length / teamCount);

  balancedDraftOrder(playingRoster).forEach((person) => {
    const openTeams = teams.filter((team) => team.players.length < maxTeamSize);
    const availableTeams = openTeams.length ? openTeams : teams;
    const shortestSize = Math.min(...availableTeams.map((team) => team.players.length));
    let candidateTeams = availableTeams.filter((team) => team.players.length === shortestSize);
    const noConflictTeams = candidateTeams.filter((team) => teamPairConflictCount(team, person) === 0);
    if (noConflictTeams.length) candidateTeams = noConflictTeams;

    const rankedTeams = candidateTeams.slice().sort((a, b) => {
      const mixedBalance = mixedGenderScore(a, person) - mixedGenderScore(b, person);
      if (mixedBalance !== 0) return mixedBalance;
      const genderBalance = genderCount(a, person.gender) - genderCount(b, person.gender);
      if (genderBalance !== 0) return genderBalance;
      const pairConflicts = teamPairConflictCount(a, person) - teamPairConflictCount(b, person);
      if (pairConflicts !== 0) return pairConflicts;
      return a.score - b.score || Math.random() - 0.5;
    });

    rankedTeams[0].players.push(person);
    rankedTeams[0].score += totalSkill(person);
  });

  generatedTeams = teams;
  recordTeamHistory(generatedTeams);
  renderTeams();
}

function renderTeams() {
  teamsGrid.innerHTML = "";

  if (!generatedTeams.length) {
    teamsGrid.innerHTML = `<div class="empty-state">Generate balanced teams when your roster is ready.</div>`;
    renderStats();
    return;
  }

  generatedTeams.forEach((team) => {
    const card = document.createElement("article");
    card.className = "team-card";
    const average = team.players.length ? team.score / team.players.length / skills.length : 0;
    const genderSummary = teamGenderSummary(team);
    card.innerHTML = `
      <div class="team-header">
        <div>
          <strong>${team.name}</strong>
          <span>${team.players.length} players${genderSummary ? ` - ${genderSummary}` : ""}</span>
        </div>
        ${isAdmin ? `<span>${average.toFixed(1)} avg</span>` : ""}
      </div>
      <ul>
        ${playersByRating(team.players).map((person) => `
          <li>
            <span>${person.name}<small>${person.gender ? genderLabel(person.gender) : ""}</small></span>
            ${isAdmin ? `<strong>${averageSkill(person).toFixed(1)}</strong>` : ""}
          </li>
        `).join("")}
      </ul>
    `;
    teamsGrid.appendChild(card);
  });

  renderStats();
}

function copyText(text) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}

function teamsText() {
  if (!generatedTeams.length) return "No teams generated yet.";
  return generatedTeams.map((team) => {
    const players = playersByRating(team.players).map((person) => {
      return isAdmin ? `- ${person.name} (${averageSkill(person).toFixed(1)})` : `- ${person.name}`;
    }).join("\n");
    return `${team.name}\n${players || "- No players"}`;
  }).join("\n\n");
}

buildSkillsForm();
renderRatingTopics();
renderSportTabs();
renderSportEditor();
setBuilderMode();
loadSharedState();

topicForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addRatingTopic(topicName.value);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const person = readForm();
  if (!person.name) return;

  const existingIndex = roster.findIndex((item) => item.id === person.id);
  if (existingIndex >= 0) {
    roster[existingIndex] = person;
  } else {
    if (roster.length >= MAX_PLAYERS) {
      saveStatus.textContent = `Roster is full at ${MAX_PLAYERS} players. Delete a player before adding another.`;
      renderStats();
      return;
    }
    roster.push(person);
  }

  generatedTeams = [];
  await saveRoster();
  resetForm();
  renderRoster();
  renderTeams();
  saveStatus.textContent = `${person.name} and ratings saved at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
});

document.querySelector("#clearForm").addEventListener("click", resetForm);

document.querySelector("#copyTeams").addEventListener("click", async () => {
  await copyText(teamsText());
});

if (sportForm) {
  sportForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addSport(sportName.value);
  });
}

if (sportTabs) {
  sportTabs.addEventListener("click", (event) => {
    const button = event.target.closest(".sport-tab");
    if (!button) return;
    switchSport(button.dataset.sport);
  });
}

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.tab}Panel`).classList.add("active");
  });
});

document.querySelector("#generateTeams").addEventListener("click", makeTeams);
