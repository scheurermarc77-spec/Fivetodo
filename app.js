import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  getDoc,
  setDoc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const daysEl = document.getElementById("days");
const bravoEl = document.getElementById("bravo");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("statusText");
const newTasksBanner = document.getElementById("newTasksBanner");
const newTasksText = document.getElementById("newTasksText");
const profileChooser = document.getElementById("profileChooser");
const appView = document.getElementById("appView");
const changeProfileBtn = document.getElementById("changeProfile");
const appTitle = document.getElementById("appTitle");
const profileEyebrow = document.getElementById("profileEyebrow");
const authorChooser = document.getElementById("authorChooser");
const bravoSub = document.getElementById("bravoSub");

const AUTHOR_KEY = "fivetodo_author_v1";
let currentAuthor = localStorage.getItem(AUTHOR_KEY) || "";

const DAY_SPECS = [
  { offset: 0, label: "Heute" },
  { offset: 1, label: "Morgen" },
  { offset: 2, label: "Übermorgen" },
  { offset: -1, label: "Gestern", hidden: true }
];

let currentProfile = null;
let db = null;
let firebaseApp = null;
let activeUnsubscribes = [];
let resumeDetectionReady = false;
let saveTimers = new Map();
let latestTodosByDay = new Map();
let initialized = false;
let midnightTimer = null;
let overdueBanner = null;

function lastSeenKey(profile=currentProfile){
  return `fivetodo_last_seen_at_v4_${profile || "none"}`;
}

function completedSeenKey(profile){
  return `fivetodo_completed_seen_at_v1_${profile}`;
}

function collectionName(){
  return "days";
}

function profileDayKey(dateKey){
  if(currentProfile === "anouk") return `anouk_${dateKey}`;
  if(currentProfile === "mami") return `mami_${dateKey}`;
  if(currentProfile === "papi") return `papi_${dateKey}`;
  return dateKey;
}

function isoDateLocal(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function addDays(dateKey, amount){
  const [y,m,d] = dateKey.split("-").map(Number);
  const date = new Date(y, m-1, d, 12, 0, 0, 0);
  date.setDate(date.getDate() + amount);
  return isoDateLocal(date);
}

function formatDate(d){
  return new Intl.DateTimeFormat("de-CH", {
    weekday:"short",
    day:"2-digit",
    month:"2-digit",
    year:"numeric"
  }).format(d);
}

function getDayInfo(){
  const now = new Date();
  now.setHours(12,0,0,0);
  return DAY_SPECS.map(spec => {
    const d = new Date(now);
    d.setDate(d.getDate() + spec.offset);
    return {...spec, date:d, key:isoDateLocal(d)};
  });
}

function emptyTodo(){
  return {
    text:"",
    done:false,
    createdAt:0,
    author:"",
    completedAt:0,
    overdue:false,
    overdueSince:"",
    rolledFrom:""
  };
}

function emptyTodos(){
  return Array.from({length:10}, () => emptyTodo());
}

function normalizeTodos(raw){
  const base = emptyTodos();
  if(!Array.isArray(raw)) return base;
  return base.map((item, i) => ({
    text: typeof raw[i]?.text === "string" ? raw[i].text : "",
    done: !!raw[i]?.done,
    createdAt: Number(raw[i]?.createdAt || 0),
    author: typeof raw[i]?.author === "string" ? raw[i].author : "",
    completedAt: Number(raw[i]?.completedAt || 0),
    overdue: !!raw[i]?.overdue,
    overdueSince: typeof raw[i]?.overdueSince === "string" ? raw[i].overdueSince : "",
    rolledFrom: typeof raw[i]?.rolledFrom === "string" ? raw[i].rolledFrom : ""
  }));
}

function compactAndSortTodos(raw){
  const todos = normalizeTodos(raw).filter(todo => todo.text.trim());

  todos.sort((a,b) => {
    const group = todo => {
      if(!todo.done && (todo.overdue || todo.rolledFrom)) return 0;
      if(!todo.done) return 1;
      return 2;
    };

    const ga = group(a);
    const gb = group(b);
    if(ga !== gb) return ga - gb;

    const ca = Number(a.createdAt || 0);
    const cb = Number(b.createdAt || 0);
    if(ca !== cb) return ca - cb;

    return String(a.text).localeCompare(String(b.text), "de");
  });

  while(todos.length < 10) todos.push(emptyTodo());
  return todos.slice(0,10);
}

function setStatus(type, text){
  statusEl.className = `status ${type}`;
  statusText.textContent = text;
}

function injectOverdueStyles(){
  if(document.getElementById("fivetodo-overdue-styles")) return;
  const style = document.createElement("style");
  style.id = "fivetodo-overdue-styles";
  style.textContent = `
    .overdue-banner{
      display:flex;
      align-items:center;
      gap:10px;
      margin:0 2px 16px;
      padding:14px 16px;
      border-radius:16px;
      background:linear-gradient(90deg,rgba(245,158,11,.19),rgba(251,113,133,.16));
      border:2px solid rgba(245,158,11,.72);
      color:var(--text);
      font-size:15px;
      font-weight:800;
      box-shadow:0 10px 28px rgba(0,0,0,.18);
    }
    .overdue-banner[hidden]{display:none!important}
    .overdue-dot{
      width:10px;height:10px;border-radius:50%;
      background:#f59e0b;
      box-shadow:0 0 0 5px rgba(245,158,11,.12);
      flex:0 0 auto;
    }
    .todo-row.is-overdue{
      position:relative;
      margin:6px 0;
      border:3px solid #f59e0b;
      border-radius:14px;
      background:rgba(245,158,11,.08);
      box-shadow:0 0 0 4px rgba(245,158,11,.08),0 10px 28px rgba(0,0,0,.18);
    }
    .todo-row.is-overdue::after{
      content:"!";
      position:absolute;
      right:-7px;
      top:-9px;
      width:25px;
      height:25px;
      display:flex;
      align-items:center;
      justify-content:center;
      text-align:center;
      font-size:17px;
      line-height:1;
      font-weight:950;
      color:#17100a;
      border-radius:50%;
      background:#f59e0b;
      border:2px solid rgba(255,255,255,.9);
      box-shadow:0 5px 14px rgba(0,0,0,.28);
      pointer-events:none;
      z-index:2;
    }
    .todo-row.is-overdue.is-new::after{
      content:"!";
      background:#f59e0b;
      color:#17100a;
    }
    .todo-row.done.is-overdue{
      margin:0;
      padding-right:0;
      border:0;
      border-bottom:1px solid var(--border);
      border-radius:0;
      background:transparent;
      box-shadow:none;
      animation:none;
    }
    .todo-row.done.is-overdue::after{display:none}
    .profile-button,
    [data-profile]{
      position:relative;
      overflow:visible;
    }
    .profile-new-badge,
    .profile-done-badge{
      position:absolute;
      min-width:23px;
      height:23px;
      padding:0 6px;
      border-radius:999px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:12px;
      font-weight:950;
      line-height:1;
      color:#fff;
      border:2px solid rgba(255,255,255,.92);
      box-shadow:0 5px 14px rgba(0,0,0,.28);
      pointer-events:none;
      z-index:4;
    }
    .profile-new-badge{
      top:-8px;
      right:-8px;
      background:#ef4444;
    }
    .profile-done-badge{
      right:-8px;
      bottom:-8px;
      background:#22c55e;
    }
    .profile-new-badge[hidden],
    .profile-done-badge[hidden]{display:none!important}
  `;
  document.head.appendChild(style);
}

function ensureOverdueBanner(){
  if(overdueBanner) return overdueBanner;
  overdueBanner = document.createElement("div");
  overdueBanner.id = "overdueBanner";
  overdueBanner.className = "overdue-banner";
  overdueBanner.hidden = true;
  overdueBanner.innerHTML = `<span class="overdue-dot"></span><span id="overdueText"></span>`;
  if(newTasksBanner?.parentNode){
    newTasksBanner.parentNode.insertBefore(overdueBanner, newTasksBanner.nextSibling);
  }else if(daysEl?.parentNode){
    daysEl.parentNode.insertBefore(overdueBanner, daysEl);
  }
  return overdueBanner;
}

function showOverdueBanner(count){
  const banner = ensureOverdueBanner();
  const text = banner.querySelector("#overdueText");
  if(count <= 0){
    banner.hidden = true;
    return;
  }
  text.textContent = count === 1
    ? "1 Aufgabe ist verspätet und wurde auf heute übertragen"
    : `${count} Aufgaben sind verspätet und wurden auf heute übertragen`;
  banner.hidden = false;
}


function ensureProfileBadges(){
  document.querySelectorAll("[data-profile]").forEach(button => {
    if(!button.querySelector(".profile-new-badge")){
      const red = document.createElement("span");
      red.className = "profile-new-badge";
      red.hidden = true;
      red.setAttribute("aria-label","Neue Aufgaben");
      button.appendChild(red);
    }
    if(!button.querySelector(".profile-done-badge")){
      const green = document.createElement("span");
      green.className = "profile-done-badge";
      green.hidden = true;
      green.setAttribute("aria-label","Neu erledigte Aufgaben");
      button.appendChild(green);
    }
  });
}

function profileName(profile){
  return ({leon:"Leon",anouk:"Anouk",mami:"Mami",papi:"Papi"})[profile] || profile;
}

function profileDayKeyFor(profile, dateKey){
  if(profile === "anouk") return `anouk_${dateKey}`;
  if(profile === "mami") return `mami_${dateKey}`;
  if(profile === "papi") return `papi_${dateKey}`;
  return dateKey;
}

async function getProfileOverviewCounts(profile){
  if(!db) return {newCount:0, doneCount:0};

  const newSince = Number(localStorage.getItem(lastSeenKey(profile)) || 0);
  const doneSince = Number(localStorage.getItem(completedSeenKey(profile)) || newSince || 0);

  let newCount = 0; // Anzahl aktuell offener Aufgaben
  let doneCount = 0; // Anzahl neu erledigter Aufgaben

  // Überblick über die sichtbaren/relevanten Tage.
  for(const info of getDayInfo()){
    try{
      const snap = await getDoc(doc(db, collectionName(), profileDayKeyFor(profile, info.key)));
      if(!snap.exists()) continue;

      const todos = normalizeTodos(snap.data().todos);
      for(const todo of todos){
        if(!todo.text.trim()) continue;

        // Rot oben rechts: ALLE aktuell noch nicht erledigten Aufgaben.
        if(!todo.done){
          newCount++;
        }

        // Grün unten rechts: nur seit dem letzten Öffnen neu erledigte Aufgaben.
        if(todo.done && todo.completedAt > 0 && todo.completedAt > doneSince){
          doneCount++;
        }
      }
    }catch(err){
      console.error("Übersicht konnte nicht gelesen werden:", profile, err);
    }
  }

  return {newCount, doneCount};
}

async function refreshProfileOverviewBadges(){
  ensureProfileBadges();
  if(!db) return;

  const profiles = ["leon","anouk","mami","papi"];
  for(const profile of profiles){
    const button = document.querySelector(`[data-profile="${profile}"]`);
    if(!button) continue;

    const {newCount, doneCount} = await getProfileOverviewCounts(profile);
    const red = button.querySelector(".profile-new-badge");
    const green = button.querySelector(".profile-done-badge");

    if(red){
      red.textContent = newCount > 99 ? "99+" : String(newCount);
      red.hidden = newCount <= 0;
      red.title = `${newCount} noch nicht erledigte Aufgabe${newCount === 1 ? "" : "n"}`;
    }
    if(green){
      green.textContent = doneCount > 99 ? "99+" : String(doneCount);
      green.hidden = doneCount <= 0;
      green.title = `${doneCount} neu erledigte Aufgabe${doneCount === 1 ? "" : "n"}`;
    }
  }
}

function markProfileOverviewSeen(profile){
  const now = Date.now();
  localStorage.setItem(lastSeenKey(profile), String(now));
  localStorage.setItem(completedSeenKey(profile), String(now));
}

function showBravo(){
  if(bravoSub){
    bravoSub.textContent = currentAuthor
      ? `Gut gemacht, ${currentAuthor}!`
      : "Gut gemacht!";
  }
  bravoEl.classList.add("show");
  bravoEl.setAttribute("aria-hidden","false");
}

function showNewTasksBanner(count){
  if(!newTasksBanner) return;
  if(count <= 0){
    newTasksBanner.hidden = true;
    return;
  }
  if(newTasksText){
    newTasksText.textContent = count === 1
      ? "1 neue Aufgabe seit deinem letzten Besuch"
      : `${count} neue Aufgaben seit deinem letzten Besuch`;
  }
  newTasksBanner.hidden = false;
}

function renderShell(){
  daysEl.innerHTML = "";
  for(const info of getDayInfo()){
    const card = document.createElement("section");
    card.className = "day-card";
    card.dataset.date = info.key;
    card.dataset.label = info.label;

    if(info.hidden){
      card.classList.add("yesterday-card");
      card.hidden = true;
    }

    const yesterdayButton = info.label === "Heute"
      ? `<button id="showYesterday" class="yesterday-button" type="button">← Gestern</button>`
      : "";

    card.innerHTML = `
      <div class="day-head">
        <div class="day-title-wrap">
          <span class="day-label">${info.label}</span>
          <span class="day-date">${formatDate(info.date)}</span>
        </div>
        <div class="day-head-actions">
          ${yesterdayButton}
          <span class="day-count" id="count-${info.key}">0/10</span>
        </div>
      </div>
      <div class="todo-list">
        ${Array.from({length:10}, (_, i) => `
          <label class="todo-row" data-index="${i}">
            <input class="check" type="checkbox" aria-label="Todo ${i+1} erledigt">
            <input class="todo-input" maxlength="140" placeholder="Todo ${i+1}" autocomplete="off" enterkeyhint="done">
            <span class="todo-author"></span>
            <span class="todo-done-time"></span>
          </label>
        `).join("")}
      </div>
    `;
    daysEl.appendChild(card);
  }

  const yesterdayButton = document.getElementById("showYesterday");
  const yesterdayCard = document.querySelector(".yesterday-card");
  if(yesterdayButton && yesterdayCard){
    yesterdayButton.addEventListener("click", () => {
      const willShow = yesterdayCard.hidden;
      yesterdayCard.hidden = !willShow;
      yesterdayButton.textContent = willShow ? "↑ Gestern schliessen" : "← Gestern";
      if(willShow){
        setTimeout(() => yesterdayCard.scrollIntoView({behavior:"smooth",block:"start"}), 40);
      }
    });
  }
}

function readLastSeen(){
  return Number(localStorage.getItem(lastSeenKey()) || 0);
}

function markCurrentMomentSeen(){
  if(!currentProfile) return;
  const now = Date.now();
  localStorage.setItem(lastSeenKey(), String(now));
  localStorage.setItem(completedSeenKey(currentProfile), String(now));
}

function getNewTaskKeysSince(lastSeen){
  const keys = [];
  for(const [dateKey, todos] of latestTodosByDay.entries()){
    normalizeTodos(todos).forEach((todo, index) => {
      if(todo.text && todo.createdAt > 0 && todo.createdAt > lastSeen){
        keys.push(`${dateKey}:${index}`);
      }
    });
  }
  return new Set(keys);
}

function refreshIndicators(){
  if(!initialized) return;
  const lastSeen = readLastSeen();
  const newKeys = getNewTaskKeysSince(lastSeen);
  let overdueCount = 0;

  document.querySelectorAll(".todo-row").forEach(row => {
    const card = row.closest(".day-card");
    const key = `${card.dataset.date}:${row.dataset.index}`;
    const isDone = row.querySelector(".check").checked;
    const isOverdue = row.dataset.overdue === "1" && !isDone;

    row.classList.toggle("is-new", newKeys.has(key) && !isDone);
    row.classList.toggle("is-overdue", isOverdue);
    if(isOverdue && card.dataset.label === "Heute") overdueCount++;
  });

  showNewTasksBanner(newKeys.size);
  showOverdueBanner(overdueCount);
}

function applyTodos(dateKey, todos){
  const card = document.querySelector(`[data-date="${dateKey}"]`);
  if(!card) return;

  const norm = compactAndSortTodos(todos);
  norm.forEach((todo, i) => {
    const row = card.querySelector(`[data-index="${i}"]`);
    const check = row.querySelector(".check");
    const input = row.querySelector(".todo-input");

    if(document.activeElement !== input){
      input.value = todo.text;
    }

    check.checked = todo.done;
    row.dataset.createdAt = String(todo.createdAt || 0);
    row.dataset.author = todo.author || "";
    row.dataset.completedAt = String(todo.completedAt || 0);
    row.dataset.overdue = todo.overdue ? "1" : "0";
    row.dataset.overdueSince = todo.overdueSince || "";
    row.dataset.rolledFrom = todo.rolledFrom || "";

    const authorEl = row.querySelector(".todo-author");
    if(authorEl){
      authorEl.textContent = todo.author ? `eingetragen von ${todo.author}` : "";
    }
    row.classList.toggle("has-author", !!todo.author);

    const doneTimeEl = row.querySelector(".todo-done-time");
    if(doneTimeEl){
      doneTimeEl.textContent = todo.done && todo.completedAt
        ? `erledigt um ${new Intl.DateTimeFormat("de-CH",{hour:"2-digit",minute:"2-digit"}).format(new Date(todo.completedAt))} Uhr`
        : "";
    }

    row.classList.toggle("has-done-time", !!(todo.done && todo.completedAt));
    row.classList.toggle("done", todo.done);
    row.classList.toggle("is-overdue", !!todo.overdue && !todo.done);
  });

  const doneCount = norm.filter(t => t.done).length;
  const count = document.getElementById(`count-${dateKey}`);
  if(count) count.textContent = `${doneCount}/10`;

  if(initialized) refreshIndicators();
}

function readCardTodos(dateKey){
  const card = document.querySelector(`[data-date="${dateKey}"]`);
  if(!card) return emptyTodos();

  return [...card.querySelectorAll(".todo-row")].map(row => ({
    text: row.querySelector(".todo-input").value.trimEnd(),
    done: row.querySelector(".check").checked,
    createdAt: Number(row.dataset.createdAt || 0),
    author: row.dataset.author || "",
    completedAt: Number(row.dataset.completedAt || 0),
    overdue: row.dataset.overdue === "1",
    overdueSince: row.dataset.overdueSince || "",
    rolledFrom: row.dataset.rolledFrom || ""
  }));
}

function queueSave(dateKey, delay=220){
  clearTimeout(saveTimers.get(dateKey));
  saveTimers.set(dateKey, setTimeout(() => saveDay(dateKey), delay));
}

async function saveDay(dateKey){
  if(!db) return;
  try{
    const todos = compactAndSortTodos(readCardTodos(dateKey));
    await setDoc(doc(db, collectionName(), profileDayKey(dateKey)), {
      todos,
      updatedAt: Date.now()
    }, {merge:true});
    latestTodosByDay.set(dateKey, todos);
    applyTodos(dateKey, todos);
    setStatus("online","Live");
  }catch(err){
    console.error(err);
    setStatus("offline","Fehler");
  }
}

function bindInputs(){
  daysEl.addEventListener("input", e => {
    if(!e.target.classList.contains("todo-input")) return;

    const row = e.target.closest(".todo-row");
    const card = e.target.closest(".day-card");

    if(e.target.value.trim() && Number(row.dataset.createdAt || 0) === 0){
      row.dataset.createdAt = String(Date.now());
      row.dataset.author = currentAuthor || "";
      row.dataset.overdue = "0";
      row.dataset.overdueSince = "";
      row.dataset.rolledFrom = "";

      const authorEl = row.querySelector(".todo-author");
      if(authorEl){
        authorEl.textContent = currentAuthor ? `eingetragen von ${currentAuthor}` : "";
      }
      row.classList.toggle("has-author", !!currentAuthor);
    }

    if(!e.target.value.trim()){
      row.dataset.createdAt = "0";
      row.dataset.author = "";
      row.dataset.completedAt = "0";
      row.dataset.overdue = "0";
      row.dataset.overdueSince = "";
      row.dataset.rolledFrom = "";

      const authorEl = row.querySelector(".todo-author");
      if(authorEl) authorEl.textContent = "";
      const doneTimeEl = row.querySelector(".todo-done-time");
      if(doneTimeEl) doneTimeEl.textContent = "";

      row.classList.remove("has-author","has-done-time","done","is-new","is-overdue");
    }

    queueSave(card.dataset.date);
  });

  daysEl.addEventListener("change", e => {
    if(!e.target.classList.contains("check")) return;

    const row = e.target.closest(".todo-row");
    const card = e.target.closest(".day-card");

    row.classList.toggle("done", e.target.checked);

    if(e.target.checked){
      row.dataset.completedAt = String(Date.now());
      // Sobald erledigt: keine Verspätet-Darstellung mehr.
      row.classList.remove("is-overdue","is-new");
      showBravo();
    }else{
      row.dataset.completedAt = "0";
      if(row.dataset.overdue === "1") row.classList.add("is-overdue");
    }

    const doneTimeEl = row.querySelector(".todo-done-time");
    if(doneTimeEl){
      doneTimeEl.textContent = e.target.checked
        ? `erledigt um ${new Intl.DateTimeFormat("de-CH",{hour:"2-digit",minute:"2-digit"}).format(new Date(Number(row.dataset.completedAt)))} Uhr`
        : "";
    }
    row.classList.toggle("has-done-time", e.target.checked);

    queueSave(card.dataset.date, 0);
    setTimeout(refreshIndicators, 20);
  });
}

function firebaseLooksConfigured(){
  const c = window.FIREBASE_CONFIG;
  return c && Object.values(c).every(v =>
    typeof v === "string" && v && !v.includes("HIER_EINTRAGEN")
  );
}

/**
 * Verschiebt alle nicht erledigten Aufgaben eines vergangenen Tages
 * in den Folgetag. Bereits verspätete Aufgaben wandern bei weiterer
 * Nichterledigung jeden Tag erneut mit.
 *
 * Die Transaktion verhindert, dass zwei iPhones dieselben Aufgaben
 * gleichzeitig doppelt verschieben.
 */
async function rolloverOneDay(sourceDateKey){
  if(!db || !currentProfile) return 0;

  const targetDateKey = addDays(sourceDateKey, 1);
  const sourceRef = doc(db, collectionName(), profileDayKey(sourceDateKey));
  const targetRef = doc(db, collectionName(), profileDayKey(targetDateKey));

  let movedCount = 0;

  await runTransaction(db, async transaction => {
    const sourceSnap = await transaction.get(sourceRef);
    const targetSnap = await transaction.get(targetRef);

    if(!sourceSnap.exists()) return;

    const sourceData = sourceSnap.data() || {};
    // Schutz gegen doppeltes Verschieben desselben Tages.
    if(sourceData.rolloverDoneTo === targetDateKey) return;

    const source = compactAndSortTodos(sourceData.todos);
    const target = compactAndSortTodos(targetSnap.exists() ? targetSnap.data().todos : []);

    const candidates = source
      .map((todo, index) => ({todo, index}))
      .filter(({todo}) => todo.text.trim() && !todo.done);

    if(candidates.length === 0){
      transaction.set(sourceRef, {
        rolloverDoneTo: targetDateKey,
        rolloverCheckedAt: Date.now(),
        updatedAt: Date.now()
      }, {merge:true});
      return;
    }

    const emptySlots = target
      .map((todo, index) => (!todo.text.trim() ? index : -1))
      .filter(index => index >= 0);

    const transferable = candidates.slice(0, emptySlots.length);
    const now = Date.now();

    transferable.forEach(({todo, index: sourceIndex}, n) => {
      const targetIndex = emptySlots[n];
      target[targetIndex] = {
        ...todo,
        done:false,
        completedAt:0,
        // Übertragene Aufgabe wird wie neu behandelt.
        createdAt: now + n,
        overdue:true,
        overdueSince: todo.overdueSince || sourceDateKey,
        rolledFrom: sourceDateKey
      };
      source[sourceIndex] = emptyTodo();
      movedCount++;
    });

    const compactTarget = compactAndSortTodos(target);
    const compactSource = compactAndSortTodos(source);

    transaction.set(targetRef, {
      todos: compactTarget,
      updatedAt: now
    }, {merge:true});

    transaction.set(sourceRef, {
      todos: compactSource,
      // Nur als vollständig erledigt markieren, wenn alle Kandidaten Platz hatten.
      rolloverDoneTo: transferable.length === candidates.length ? targetDateKey : "",
      rolloverCheckedAt: now,
      updatedAt: now
    }, {merge:true});
  });

  return movedCount;
}

async function rolloverMissedDays(){
  if(!db || !currentProfile) return;

  const todayKey = isoDateLocal(new Date());
  const yesterdayKey = addDays(todayKey, -1);

  // Für den normalen Fall genügt gestern -> heute.
  // Zusätzlich bis zu 14 Tage zurück prüfen, falls die App länger nicht geöffnet war.
  const sources = [];
  for(let i = 14; i >= 1; i--){
    sources.push(addDays(todayKey, -i));
  }

  let totalMoved = 0;
  for(const sourceKey of sources){
    // Nur Tage vor heute.
    if(sourceKey < todayKey){
      try{
        totalMoved += await rolloverOneDay(sourceKey);
      }catch(err){
        console.error("Übertragung fehlgeschlagen:", sourceKey, err);
      }
    }
  }

  if(totalMoved > 0){
    // Die Live-Snapshots aktualisieren die Ansicht; kleine Verzögerung für Banner.
    setTimeout(refreshIndicators, 350);
  }
}

function msUntilNextMidnight(){
  const now = new Date();
  const next = new Date(now);
  next.setHours(24,0,1,0);
  return Math.max(1000, next.getTime() - now.getTime());
}

function scheduleMidnightRollover(){
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(async () => {
    if(currentProfile && document.visibilityState === "visible"){
      await rolloverMissedDays();
      // Nach Datumswechsel Karten neu aufbauen und neu abonnieren.
      chooseProfile(currentProfile);
    }
    scheduleMidnightRollover();
  }, msUntilNextMidnight());
}

function setupResumeDetection(){
  if(resumeDetectionReady) return;
  resumeDetectionReady = true;

  document.addEventListener("visibilitychange", async () => {
    if(document.visibilityState === "hidden"){
      markCurrentMomentSeen();
      return;
    }

    if(document.visibilityState === "visible"){
      // Nach Rückkehr prüfen, ob inzwischen Mitternacht war.
      try{
        await rolloverMissedDays();
      }catch(err){
        console.error(err);
      }
      setTimeout(refreshIndicators, 350);
    }
  });

  window.addEventListener("pageshow", async () => {
    try{
      await rolloverMissedDays();
    }catch(err){
      console.error(err);
    }
    setTimeout(refreshIndicators, 350);
  });
}

async function start(){
  injectOverdueStyles();
  ensureOverdueBanner();
  renderShell();
  bindInputs();
  setupResumeDetection();

  if(!firebaseLooksConfigured()){
    setStatus("offline","Firebase fehlt");
    return;
  }

  try{
    if(!firebaseApp){
      firebaseApp = initializeApp(window.FIREBASE_CONFIG);
    }
    db = getFirestore(firebaseApp);
    setStatus("","Verbinde…");

    // Personenübersicht mit neuen/erledigten Aufgaben aktualisieren.
    await refreshProfileOverviewBadges();

    // Zuerst fällige Aufgaben verschieben, erst danach Live-Listener aufbauen.
    await rolloverMissedDays();

    let firstSnapshotsLeft = DAY_SPECS.length;

    for(const info of getDayInfo()){
      const unsubscribe = onSnapshot(
        doc(db, collectionName(), profileDayKey(info.key)),
        snap => {
          const todos = snap.exists() ? snap.data().todos : emptyTodos();
          const compactedTodos = compactAndSortTodos(todos);
          latestTodosByDay.set(info.key, compactedTodos);
          applyTodos(info.key, compactedTodos);
          setStatus("online","Live");

          const originalJson = JSON.stringify(normalizeTodos(todos));
          const compactedJson = JSON.stringify(compactedTodos);
          if(originalJson !== compactedJson){
            setDoc(doc(db, collectionName(), profileDayKey(info.key)), {
              todos: compactedTodos,
              updatedAt: Date.now()
            }, {merge:true}).catch(console.error);
          }

          if(firstSnapshotsLeft > 0){
            firstSnapshotsLeft--;
            if(firstSnapshotsLeft === 0){
              initialized = true;
              if(readLastSeen() === 0){
                markCurrentMomentSeen();
                showNewTasksBanner(0);
              }else{
                refreshIndicators();
              }
            }
          }else if(document.visibilityState === "visible"){
            refreshIndicators();
          }
        },
        err => {
          console.error(err);
          setStatus("offline","Offline");
        }
      );
      activeUnsubscribes.push(unsubscribe);
    }

    scheduleMidnightRollover();
  }catch(err){
    console.error(err);
    setStatus("offline","Fehler");
  }
}

if("serviceWorker" in navigator){
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js")
  );
}

function resetForProfile(){
  activeUnsubscribes.forEach(unsubscribe => {
    try{ unsubscribe(); }catch(e){}
  });
  activeUnsubscribes = [];
  latestTodosByDay = new Map();
  initialized = false;
  saveTimers.forEach(timer => clearTimeout(timer));
  saveTimers = new Map();
  clearTimeout(midnightTimer);

  if(newTasksBanner) newTasksBanner.hidden = true;
  if(overdueBanner) overdueBanner.hidden = true;
  daysEl.innerHTML = "";
}

function chooseProfile(profile){
  currentProfile = profile;
  markProfileOverviewSeen(profile);

  const selectedButton = document.querySelector(`[data-profile="${profile}"]`);
  if(selectedButton){
    const green = selectedButton.querySelector(".profile-done-badge");
    if(green) green.hidden = true;
  }

  resetForProfile();

  document.body.classList.toggle("profile-anouk", profile === "anouk");
  profileChooser.hidden = true;
  appView.hidden = false;
  window.scrollTo({top:0,left:0,behavior:"instant"});

  const names = {leon:"Leon",anouk:"Anouk",mami:"Mami",papi:"Papi"};
  const name = names[profile] || "Leon";
  appTitle.textContent = `FiveTodo · ${name}`;
  profileEyebrow.textContent = `${name.toUpperCase()} · LIVE`;

  start();
}

function ensureAuthor(){
  currentAuthor = localStorage.getItem(AUTHOR_KEY) || "";
  authorChooser.hidden = !!currentAuthor;
}

document.querySelectorAll("[data-author]").forEach(button => {
  button.addEventListener("click", () => {
    currentAuthor = button.dataset.author;
    localStorage.setItem(AUTHOR_KEY, currentAuthor);
    authorChooser.hidden = true;
  });
});

ensureAuthor();
ensureProfileBadges();

async function initOverviewOnly(){
  injectOverdueStyles();
  ensureProfileBadges();

  if(!firebaseLooksConfigured()) return;

  try{
    if(!firebaseApp){
      firebaseApp = initializeApp(window.FIREBASE_CONFIG);
    }
    db = getFirestore(firebaseApp);
    await refreshProfileOverviewBadges();
  }catch(err){
    console.error("Übersicht konnte nicht geladen werden:", err);
  }
}

initOverviewOnly();

bravoEl.addEventListener("click", () => {
  bravoEl.classList.remove("show");
  bravoEl.setAttribute("aria-hidden","true");
});

document.querySelectorAll("[data-profile]").forEach(button => {
  button.addEventListener("click", () => chooseProfile(button.dataset.profile));
});

changeProfileBtn.addEventListener("click", async () => {
  currentProfile = null;
  resetForProfile();
  appView.hidden = true;
  profileChooser.hidden = false;
  window.scrollTo({top:0,left:0,behavior:"instant"});
  document.body.classList.remove("profile-anouk");
  await refreshProfileOverviewBadges();
});
