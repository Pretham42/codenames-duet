/* ============================================================
   DUET — game logic
   ------------------------------------------------------------
   Two players, one device, hidden information on both sides.
   The device is passed once per turn: you arrive holding it,
   answer your partner's clue, write your own, and hand it back.
   ============================================================ */

const AGENT = "agent";
const ASSASSIN = "assassin";
const BYSTANDER = "bystander";

/* The authentic Codenames Duet key card, expressed as a matrix of
   [player 1's category, player 2's category, how many cards]:
   9 agents + 3 assassins + 13 bystanders per side, with 3 agents,
   1 assassin and 7 bystanders shared. 15 distinct agents to find,
   and 5 words that are lethal to somebody. */
const KEY_MATRIX = [
  [AGENT,     AGENT,     3],
  [AGENT,     ASSASSIN,  1],
  [AGENT,     BYSTANDER, 5],
  [ASSASSIN,  AGENT,     1],
  [ASSASSIN,  ASSASSIN,  1],
  [ASSASSIN,  BYSTANDER, 1],
  [BYSTANDER, AGENT,     5],
  [BYSTANDER, ASSASSIN,  1],
  [BYSTANDER, BYSTANDER, 7],
];

const DIFFICULTIES = [
  { id: "rookie",  name: "Rookie",   turns: 11, blurb: "Space to learn the rhythm." },
  { id: "agent",   name: "Agent",    turns: 9,  blurb: "The standard mission." },
  { id: "veteran", name: "Veteran",  turns: 8,  blurb: "No turns to waste." },
  { id: "legend",  name: "Legend",   turns: 7,  blurb: "Every clue has to land." },
];

const NUMBERS = ["0","1","2","3","4","5","6","7","8","9","∞"];

/* ---------- persistence ---------- */
const store = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  }
};

let settings = store.read("duet.settings", { names: ["", ""], pack: "classic", diff: "agent" });
let record = store.read("duet.record", { played: 0, won: 0, best: null });

let S = null;   // live game state

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nameOf(p) {
  return settings.names[p]?.trim() || `Player ${p + 1}`;
}

function icon(id, cls = "") {
  return `<svg class="${cls}"><use href="#${id}"/></svg>`;
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
  window.scrollTo(0, 0);
}

/* ============================================================
   SETUP SCREEN
   ============================================================ */

function renderSetup() {
  $("name1").value = settings.names[0] || "";
  $("name2").value = settings.names[1] || "";

  $("pack-grid").innerHTML = Object.entries(WORD_PACKS).map(([id, p]) => `
    <button class="opt" data-pack="${id}" aria-pressed="${settings.pack === id}">
      <span class="opt-name">${p.name} <span class="opt-meta">${p.words.length} words</span></span>
      <span class="opt-blurb">${p.blurb}</span>
    </button>`).join("");

  $("diff-grid").innerHTML = DIFFICULTIES.map(d => `
    <button class="opt" data-diff="${d.id}" aria-pressed="${settings.diff === d.id}">
      <span class="opt-name">${d.name}</span>
      <span class="opt-meta">${d.turns} turns</span>
      <span class="opt-blurb">${d.blurb}</span>
    </button>`).join("");

  const rate = record.played ? Math.round((record.won / record.played) * 100) : 0;
  $("record").innerHTML = record.played === 0 ? "" : `
    <div><div class="rv">${record.won}</div><div class="rl">Missions won</div></div>
    <div><div class="rv">${rate}%</div><div class="rl">Success rate</div></div>
    ${record.best != null ? `<div><div class="rv">${record.best}</div><div class="rl">Fewest clues</div></div>` : ""}`;
}

function bindSetup() {
  $("pack-grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pack]");
    if (!b) return;
    settings.pack = b.dataset.pack;
    saveSettings();
    renderSetup();
  });

  $("diff-grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-diff]");
    if (!b) return;
    settings.diff = b.dataset.diff;
    saveSettings();
    renderSetup();
  });

  ["name1", "name2"].forEach((id, i) => {
    $(id).addEventListener("input", (e) => { settings.names[i] = e.target.value; saveSettings(); });
  });

  $("btn-start").addEventListener("click", startGame);
}

function saveSettings() { store.write("duet.settings", settings); }

/* ============================================================
   GAME SETUP
   ============================================================ */

function startGame() {
  const pack = WORD_PACKS[settings.pack] || WORD_PACKS.classic;
  const diff = DIFFICULTIES.find(d => d.id === settings.diff) || DIFFICULTIES[1];

  const words = shuffle([...pack.words]).slice(0, 25);

  const pairs = [];
  KEY_MATRIX.forEach(([a, b, n]) => { for (let i = 0; i < n; i++) pairs.push([a, b]); });
  shuffle(pairs);

  const keys = [pairs.map(p => p[0]), pairs.map(p => p[1])];

  S = {
    words,
    keys,
    totalAgents: words.filter((_, i) => keys[0][i] === AGENT || keys[1][i] === AGENT).length,
    found: Array(25).fill(false),
    marks: [Array(25).fill(false), Array(25).fill(false)],
    holder: 0,
    phase: "clue",
    pending: null,
    turnsLeft: diff.turns,
    turnsUsed: 0,
    sudden: false,
    armed: null,
    peek: true,
    log: [],
    over: null,
    fatal: null,
  };

  goHandoff();
}

/* ============================================================
   HANDOFF
   ============================================================ */

function goHandoff() {
  const p = S.holder;
  const badge = $("handoff-badge");
  badge.className = `handoff-badge p${p + 1}`;
  $("handoff-name").textContent = nameOf(p);
  $("handoff-name").style.color = p === 0 ? "var(--p1)" : "var(--p2)";

  const clueBox = $("handoff-clue");
  if (S.sudden) {
    $("handoff-sub").textContent = "Sudden death. No more clues — go on what you already know.";
    clueBox.hidden = true;
  } else if (S.pending) {
    $("handoff-sub").textContent = "Answer the clue, then write one of your own.";
    clueBox.hidden = false;
    clueBox.innerHTML = `${nameOf(S.pending.from)} is waiting on <b>${escapeHtml(S.pending.word)} ${S.pending.num}</b>`;
  } else {
    $("handoff-sub").textContent = "You're up first. Take a look at your key and send a clue.";
    clueBox.hidden = true;
  }

  showScreen("screen-handoff");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ============================================================
   RENDER
   ============================================================ */

function render() {
  showScreen("screen-game");
  renderHud();
  renderBanner();
  renderBoard();
  renderActions();
  renderLog();
}

function renderHud() {
  const p = S.holder;
  $("hud-dot").className = `pdot p${p + 1}`;
  $("hud-who").textContent = S.over ? "Mission over" : `${nameOf(p)}'s turn`;
  $("stat-found").textContent = `${S.found.filter(Boolean).length}/${S.totalAgents}`;
  $("stat-turns").textContent = S.sudden ? "—" : S.turnsLeft;

  const total = S.turnsLeft + S.turnsUsed;
  $("tokens").innerHTML = Array.from({ length: total }, (_, i) =>
    `<span class="token${i < S.turnsUsed ? " spent" : ""}"></span>`).join("");
  $("stat-turns-wrap").classList.toggle("warn", !S.sudden && S.turnsLeft <= 2);

  const peekIcon = $("btn-peek").querySelector("use");
  peekIcon.setAttribute("href", S.peek ? "#i-eye" : "#i-eye-off");
  $("btn-peek").style.display = S.over ? "none" : "";
  $("btn-quit").textContent = S.over ? "Back to menu" : "Abandon mission";
}

function renderBanner() {
  const b = $("banner");
  b.className = "banner";
  const partner = nameOf(1 - S.holder);

  if (S.over) {
    b.innerHTML = `<div class="banner-icon">${icon(S.over.win ? "i-agent" : "i-skull")}</div>
      <div class="banner-text"><div class="banner-title">Full key revealed</div>
      <div class="banner-sub">Left half of each card is ${nameOf(0)}'s key, right half is ${nameOf(1)}'s.</div></div>`;
    return;
  }

  if (S.sudden) {
    b.className = "banner sd-banner";
    b.innerHTML = `<div class="banner-icon">${icon("i-skull")}</div>
      <div class="banner-text"><div class="banner-title">Sudden death</div>
      <div class="banner-sub">No clues left. Every card you tap must be one of ${partner}'s agents — one miss ends it.</div></div>`;
    return;
  }

  if (S.phase === "guess") {
    b.className = "banner clue-banner";
    b.innerHTML = `<div class="banner-icon">${icon("i-radio")}</div>
      <div class="banner-text">
        <div class="clue-word">${escapeHtml(S.pending.word)}<span class="clue-num">${S.pending.num}</span></div>
        <div class="banner-sub">From ${escapeHtml(nameOf(S.pending.from))} — keep going as long as you're right.</div>
      </div>`;
    return;
  }

  b.innerHTML = `<div class="banner-icon">${icon("i-target")}</div>
    <div class="banner-text"><div class="banner-title">Your turn to send</div>
    <div class="banner-sub">Green cards are your agents. Dark red are your assassins — steer ${partner} well clear.</div></div>`;
}

function renderBoard() {
  const board = $("board");
  const partner = 1 - S.holder;
  board.innerHTML = S.words.map((w, i) => {
    const cls = ["card"];
    let inner = "";

    if (S.over) {
      cls.push("reveal-both");
      inner += `<span class="split">
          <span class="s-${S.keys[0][i]}"></span><span class="s-${S.keys[1][i]}"></span>
        </span>`;
      if (S.found[i]) { cls.push("found-ring"); inner += `<span class="card-icon">${icon("i-agent")}</span>`; }
      if (S.fatal === i) cls.push("killed");
    } else if (S.found[i]) {
      cls.push("found");
      inner += `<span class="card-icon">${icon("i-agent")}</span>`;
    } else {
      const m0 = S.marks[0][i], m1 = S.marks[1][i];
      if (m0 || m1) {
        cls.push("bystander");
        if (m0 && m1) cls.push("both");
        inner += `<span class="marks">
          ${m0 ? '<span class="mark p1">1</span>' : ""}${m1 ? '<span class="mark p2">2</span>' : ""}
        </span>`;
      }
      if (S.peek) {
        const mine = S.keys[S.holder][i];
        if (S.phase === "clue" && mine !== BYSTANDER) {
          cls.push(`key-${mine}`);
        } else if (S.phase === "guess" && mine !== BYSTANDER) {
          inner += `<span class="key-dot ${mine}"></span>`;
        }
      }
      if (S.armed === i) cls.push("armed");
    }

    const clickable = !S.over && S.phase === "guess" && !S.found[i] && !S.marks[partner][i];
    const long = w.replace(/\s/g, "").length > 8 && !w.includes(" ") ? " long" : "";
    return `<button class="${cls.join(" ")}" data-i="${i}" ${clickable ? "" : "disabled"}>
        ${inner}<span class="card-word${long}">${escapeHtml(w)}</span>
      </button>`;
  }).join("");
}

function renderActions() {
  const box = $("actions");
  const partner = 1 - S.holder;

  if (S.over) { box.innerHTML = ""; box.style.display = "none"; return; }
  box.style.display = "";

  /* --- guessing --- */
  if (S.phase === "guess") {
    if (S.armed !== null) {
      box.innerHTML = `<div class="armed-bar">
          <div class="armed-label">Make contact with <b>${escapeHtml(S.words[S.armed])}</b>?</div>
          <button class="btn btn-ghost" data-act="cancel">Cancel</button>
          <button class="btn btn-primary" data-act="confirm">Confirm</button>
        </div>`;
    } else if (S.sudden) {
      box.innerHTML = `<div class="guess-hint">Tap a card to aim, tap <b>Confirm</b> to commit. Anything that isn't one of ${escapeHtml(nameOf(partner))}'s agents loses the mission.</div>
        <div class="action-row"><button class="btn btn-ghost" data-act="handover">Hand the device to ${escapeHtml(nameOf(partner))}</button></div>`;
    } else {
      box.innerHTML = `<div class="guess-hint">Tap a card to aim, tap <b>Confirm</b> to commit. Guess as often as you like while you're right.</div>
        <div class="action-row"><button class="btn btn-ghost" data-act="stop">Stop here — ends the turn</button></div>`;
    }
    return;
  }

  /* --- writing a clue --- */
  box.innerHTML = `
    <form class="clue-form" id="clue-form" autocomplete="off">
      <label for="clue-word">Your clue for ${escapeHtml(nameOf(partner))}</label>
      <input class="clue-input" id="clue-word" maxlength="24" placeholder="one word…" autocomplete="off" spellcheck="false">
      <div class="num-row" id="num-row">
        ${NUMBERS.map(n => `<button type="button" class="num" data-n="${n}" aria-pressed="false">${n}</button>`).join("")}
      </div>
      <div class="form-msg" id="clue-msg"></div>
      <div class="action-row">
        <button type="submit" class="btn btn-primary btn-lg">Send clue &amp; pass the device</button>
      </div>
    </form>`;

  let picked = null;
  const numRow = $("num-row");
  numRow.addEventListener("click", (e) => {
    const b = e.target.closest("[data-n]");
    if (!b) return;
    picked = b.dataset.n;
    numRow.querySelectorAll(".num").forEach(n => n.setAttribute("aria-pressed", String(n === b)));
    $("clue-msg").textContent = "";
  });

  $("clue-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = $("clue-word").value.trim();
    const msg = $("clue-msg");

    if (!raw) { msg.textContent = "Write a clue word first."; return; }
    if (/\s/.test(raw)) { msg.textContent = "One word only — no spaces."; return; }
    if (picked === null) { msg.textContent = "Pick a number to go with it."; return; }

    const clash = S.words.find((w, i) => !S.found[i] && w.toLowerCase() === raw.toLowerCase());
    if (clash) { msg.textContent = `${clash} is sitting right there on the board. Pick another word.`; return; }

    submitClue(raw.toUpperCase(), picked);
  });
  // Deliberately no autofocus: the clue-giver needs to study the board
  // first, and on a phone the keyboard would cover it.
}

function renderLog() {
  const box = $("log");
  if (!S.log.length) { box.innerHTML = '<div class="log-empty">No clues yet.</div>'; return; }

  box.innerHTML = [...S.log].reverse().map(e => {
    const chips = e.guesses.map(g =>
      `<span class="log-chip ${g.result}">${g.result === "pass" ? "stopped" : escapeHtml(S.words[g.i])}</span>`).join("");
    const head = e.sudden
      ? `<span class="log-from">Sudden death · ${escapeHtml(nameOf(e.from))} guessing</span>`
      : `<span class="log-from">${escapeHtml(nameOf(e.from))}</span>
         <span class="log-clue">${escapeHtml(e.word)}</span><span class="log-n">${e.num}</span>`;
    return `<div class="log-row p${e.from + 1}">
        <div class="log-head">${head}</div>
        ${chips ? `<div class="log-guesses">${chips}</div>` : ""}
      </div>`;
  }).join("");
}

/* ============================================================
   TURN FLOW
   ============================================================ */

function submitClue(word, num) {
  S.pending = { from: S.holder, word, num };
  S.log.push({ from: S.holder, word, num, guesses: [] });
  S.holder = 1 - S.holder;
  S.phase = "guess";
  S.armed = null;
  goHandoff();
}

function currentEntry() { return S.log[S.log.length - 1]; }

/* Tokens tick over only when a turn *ends*, so a mission won mid-turn
   would under-report. Clues sent is what the players actually counted. */
function cluesSent() { return S.log.filter(e => !e.sudden).length; }

function commitGuess(i) {
  const partner = 1 - S.holder;
  const category = S.keys[partner][i];
  S.armed = null;

  if (category === AGENT) {
    S.found[i] = true;
    currentEntry().guesses.push({ i, result: "agent" });
    if (S.found.filter(Boolean).length === S.totalAgents) return endGame(true);
    render();
    return;
  }

  if (category === ASSASSIN) {
    currentEntry().guesses.push({ i, result: "assassin" });
    S.fatal = i;
    return endGame(false, "assassin");
  }

  // bystander
  S.marks[partner][i] = true;
  currentEntry().guesses.push({ i, result: "bystander" });
  if (S.sudden) { S.fatal = i; return endGame(false, "sudden"); }
  endTurn();
}

function endTurn(voluntary = false) {
  if (voluntary) currentEntry().guesses.push({ result: "pass" });

  S.turnsLeft--;
  S.turnsUsed++;
  S.pending = null;
  S.armed = null;

  if (S.found.filter(Boolean).length === S.totalAgents) return endGame(true);

  if (S.turnsLeft <= 0) {
    S.sudden = true;
    S.phase = "guess";
    S.log.push({ from: S.holder, sudden: true, guesses: [] });
    render();
    return;
  }

  S.phase = "clue";   // same player now writes their own clue
  render();
}

function handOver() {
  S.holder = 1 - S.holder;
  S.armed = null;
  S.log.push({ from: S.holder, sudden: true, guesses: [] });
  goHandoff();
}

/* ============================================================
   END
   ============================================================ */

function endGame(win, reason) {
  S.over = { win, reason };
  S.armed = null;

  record.played++;
  if (win) {
    record.won++;
    if (record.best == null || cluesSent() < record.best) record.best = cluesSent();
  }
  store.write("duet.record", record);

  render();
  showResult();
}

function showResult() {
  const { win, reason } = S.over;
  const card = $("result-card");
  card.className = `result-card ${win ? "win" : "lose"}`;
  $("result-mark").innerHTML = icon(win ? "i-agent" : "i-skull");
  const found = S.found.filter(Boolean).length;
  const left = S.totalAgents - found;
  const fatalWord = S.fatal != null ? S.words[S.fatal] : "";

  $("result-title").textContent =
    win ? `All ${S.totalAgents} contacted`
    : reason === "assassin" ? "Assassin"
    : "Sudden death";

  $("result-text").textContent =
    win ? "Every agent is out and nobody tripped an assassin. Clean work."
    : reason === "assassin" ? `${fatalWord} was an assassin on ${nameOf(1 - S.holder)}'s key. That ends the whole mission.`
    : `${fatalWord} wasn't one of ${nameOf(1 - S.holder)}'s agents, and there were no clues left to spend. ${left} agent${left === 1 ? "" : "s"} still in the cold.`;

  $("result-found").textContent = `${found}/${S.totalAgents}`;
  $("result-turns").textContent = cluesSent();
  $("result").hidden = false;
  $("btn-results").hidden = true;
}

function closeResult() {
  $("result").hidden = true;
  $("btn-results").hidden = false;
}

function leaveGame() {
  $("result").hidden = true;
  $("btn-results").hidden = true;
  showScreen("screen-setup");
  renderSetup();
}

/* ============================================================
   EVENTS
   ============================================================ */

function bindGame() {
  $("btn-handoff").addEventListener("click", () => { render(); });

  $("board").addEventListener("click", (e) => {
    const b = e.target.closest(".card");
    if (!b || b.disabled) return;
    const i = Number(b.dataset.i);
    if (S.armed === i) { commitGuess(i); } else { S.armed = i; render(); }
  });

  $("actions").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "confirm") commitGuess(S.armed);
    else if (act === "cancel") { S.armed = null; render(); }
    else if (act === "stop") endTurn(true);
    else if (act === "handover") handOver();
  });

  $("btn-peek").addEventListener("click", () => { S.peek = !S.peek; render(); });

  $("btn-quit").addEventListener("click", () => {
    if (S.over || confirm("Abandon this mission and go back to the menu?")) leaveGame();
  });

  $("btn-again").addEventListener("click", () => { $("btn-results").hidden = true; $("result").hidden = true; startGame(); });
  $("btn-menu").addEventListener("click", leaveGame);
  $("btn-study").addEventListener("click", closeResult);
  $("btn-results").addEventListener("click", () => { $("result").hidden = false; $("btn-results").hidden = true; });
}

renderSetup();
bindSetup();
bindGame();
