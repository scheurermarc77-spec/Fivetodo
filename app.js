import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc
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
const AUTHOR_KEY = "fivetodo_author_v1";
let currentAuthor = localStorage.getItem(AUTHOR_KEY) || "";


const DAY_SPECS = [
  { offset: 0, label: "Heute" },
  { offset: 1, label: "Morgen" },
  { offset: 2, label: "Übermorgen" },
  { offset: -1, label: "Gestern", hidden: true }
];

let currentProfile = null;

function lastSeenKey(){
  return `fivetodo_last_seen_at_v3_${currentProfile || "none"}`;
}

function collectionName(){
  return "days";
}

function profileDayKey(dateKey){
  return currentProfile === "anouk" ? `anouk_${dateKey}` : dateKey;
}

let db = null;
let firebaseApp = null;
let activeUnsubscribes = [];
let resumeDetectionReady = false;
let saveTimers = new Map();
let bravoTimer = null;
let latestTodosByDay = new Map();
let appVisibleSince = Date.now();
let initialized = false;

function isoDateLocal(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
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

function emptyTodos(){
  return Array.from({length:10}, () => ({
    text:"",
    done:false,
    createdAt:0,
    author:"",
    completedAt:0
  }));
}

function normalizeTodos(raw){
  const base = emptyTodos();
  if(!Array.isArray(raw)) return base;

  return base.map((item, i) => ({
    text: typeof raw[i]?.text === "string" ? raw[i].text : "",
    done: !!raw[i]?.done,
    createdAt: Number(raw[i]?.createdAt || 0),
    author: typeof raw[i]?.author === "string" ? raw[i].author : "",
    completedAt: Number(raw[i]?.completedAt || 0)
  }));
}

function setStatus(type, text){
  statusEl.className = `status ${type}`;
  statusText.textContent = text;
}

function showBravo(){
  clearTimeout(bravoTimer);
  bravoEl.classList.add("show");
  bravoEl.setAttribute("aria-hidden","false");

  bravoTimer = setTimeout(() => {
    bravoEl.classList.remove("show");
    bravoEl.setAttribute("aria-hidden","true");
  }, 360);
}

function showNewTasksBanner(count){
  if(count <= 0){
    newTasksBanner.hidden = true;
    return;
  }

  newTasksText.textContent = count === 1
    ? "1 neue Aufgabe seit deinem letzten Besuch"
    : `${count} neue Aufgaben seit deinem letzten Besuch`;

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
        setTimeout(() => {
          yesterdayCard.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 40);
      }
    });
  }
}

function readLastSeen(){
  return Number(localStorage.getItem(lastSeenKey()) || 0);
}

function markCurrentMomentSeen(){
  localStorage.setItem(lastSeenKey(), String(Date.now()));
}

function getNewTaskKeysSince(lastSeen){
  const keys = [];

  for(const [dateKey, todos] of latestTodosByDay.entries()){
    const norm = normalizeTodos(todos);

    norm.forEach((todo, index) => {
      if(todo.text && todo.createdAt > 0 && todo.createdAt > lastSeen){
        keys.push(`${dateKey}:${index}`);
      }
    });
  }

  return new Set(keys);
}

function refreshNewIndicators(){
  if(!initialized) return;

  const lastSeen = readLastSeen();
  const newKeys = getNewTaskKeysSince(lastSeen);

  document.querySelectorAll(".todo-row").forEach(row => {
    const card = row.closest(".day-card");
    const key = `${card.dataset.date}:${row.dataset.index}`;
    row.classList.toggle("is-new", newKeys.has(key));
  });

  showNewTasksBanner(newKeys.size);
}

function applyTodos(dateKey, todos){
  const card = document.querySelector(`[data-date="${dateKey}"]`);
  if(!card) return;

  const norm = normalizeTodos(todos);

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
    const authorEl = row.querySelector(".todo-author");
    if(authorEl){
      authorEl.textContent = todo.author ? `eingetragen von ${todo.author}` : "";
    }
    row.classList.toggle("has-author", !!todo.author);

    const doneTimeEl = row.querySelector(".todo-done-time");
    if(doneTimeEl){
      doneTimeEl.textContent = todo.done && todo.completedAt
        ? `erledigt um ${new Intl.DateTimeFormat("de-CH", {hour:"2-digit", minute:"2-digit"}).format(new Date(todo.completedAt))} Uhr`
        : "";
    }
    row.classList.toggle("has-done-time", !!(todo.done && todo.completedAt));
    row.classList.toggle("done", todo.done);
  });

  const doneCount = norm.filter(t => t.done).length;
  const count = document.getElementById(`count-${dateKey}`);

  if(count){
    count.textContent = `${doneCount}/10`;
  }
}

function readCardTodos(dateKey){
  const card = document.querySelector(`[data-date="${dateKey}"]`);
  if(!card) return emptyTodos();

  return [...card.querySelectorAll(".todo-row")].map(row => ({
    text: row.querySelector(".todo-input").value.trimEnd(),
    done: row.querySelector(".check").checked,
    createdAt: Number(row.dataset.createdAt || 0),
    author: row.dataset.author || "",
    completedAt: Number(row.dataset.completedAt || 0)
  }));
}

function queueSave(dateKey, delay=220){
  clearTimeout(saveTimers.get(dateKey));
  saveTimers.set(dateKey, setTimeout(() => saveDay(dateKey), delay));
}

async function saveDay(dateKey){
  if(!db) return;

  try{
    const todos = readCardTodos(dateKey);

    await setDoc(doc(db, collectionName(), profileDayKey(dateKey)), {
      todos,
      updatedAt: Date.now()
    }, {merge:true});

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
      const authorEl = row.querySelector(".todo-author");
      if(authorEl) authorEl.textContent = "";
      row.classList.remove("has-author");
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
      showBravo();
    }else{
      row.dataset.completedAt = "0";
    }

    const doneTimeEl = row.querySelector(".todo-done-time");
    if(doneTimeEl){
      doneTimeEl.textContent = e.target.checked
        ? `erledigt um ${new Intl.DateTimeFormat("de-CH", {hour:"2-digit", minute:"2-digit"}).format(new Date(Number(row.dataset.completedAt)))} Uhr`
        : "";
    }
    row.classList.toggle("has-done-time", e.target.checked);

    queueSave(card.dataset.date, 0);
  });
}

function firebaseLooksConfigured(){
  const c = window.FIREBASE_CONFIG;

  return c && Object.values(c).every(v =>
    typeof v === "string" &&
    v &&
    !v.includes("HIER_EINTRAGEN")
  );
}

function setupResumeDetection(){
  if(resumeDetectionReady) return;
  resumeDetectionReady = true;

  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "hidden"){
      // Zeitpunkt merken, an dem der Nutzer FiveTodo verlassen hat.
      markCurrentMomentSeen();
      return;
    }

    if(document.visibilityState === "visible"){
      appVisibleSince = Date.now();

      // Firestore liefert ohnehin den aktuellen Stand live.
      // Kurz warten, damit ein eventuell neuer Snapshot zuerst ankommt.
      setTimeout(() => {
        refreshNewIndicators();
      }, 350);
    }
  });

  window.addEventListener("pageshow", () => {
    setTimeout(() => {
      refreshNewIndicators();
    }, 350);
  });
}

async function start(){
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

    let firstSnapshotsLeft = DAY_SPECS.length;

    for(const info of getDayInfo()){
      const unsubscribe = onSnapshot(doc(db, collectionName(), profileDayKey(info.key)), snap => {
        const todos = snap.exists()
          ? snap.data().todos
          : emptyTodos();

        latestTodosByDay.set(info.key, todos);
        applyTodos(info.key, todos);

        setStatus("online","Live");

        if(firstSnapshotsLeft > 0){
          firstSnapshotsLeft--;

          if(firstSnapshotsLeft === 0){
            initialized = true;

            // Beim allerersten Start auf diesem Gerät alte Aufgaben nicht als neu markieren.
            if(readLastSeen() === 0){
              markCurrentMomentSeen();
              showNewTasksBanner(0);
            }else{
              refreshNewIndicators();
            }
          }
        }else{
          // Kommt während einer sichtbaren Sitzung eine neue Aufgabe rein,
          // markieren wir sie ebenfalls sofort.
          if(document.visibilityState === "visible"){
            refreshNewIndicators();
          }
        }
      }, err => {
        console.error(err);
        setStatus("offline","Offline");
      });

      activeUnsubscribes.push(unsubscribe);
    }
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
  newTasksBanner.hidden = true;
  daysEl.innerHTML = "";
}

function chooseProfile(profile){
  currentProfile = profile;
  resetForProfile();

  document.body.classList.toggle("profile-anouk", profile === "anouk");
  profileChooser.hidden = true;
  appView.hidden = false;
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });

  const name = profile === "anouk" ? "Anouk" : "Leon";
  appTitle.textContent = `FiveTodo · ${name}`;
  profileEyebrow.textContent = profile === "anouk" ? "ANOUK · LIVE" : "LEON · LIVE";

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

document.querySelectorAll("[data-profile]").forEach(button => {
  button.addEventListener("click", () => chooseProfile(button.dataset.profile));
});

changeProfileBtn.addEventListener("click", () => {
  currentProfile = null;
  appView.hidden = true;
  profileChooser.hidden = false;
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  document.body.classList.remove("profile-anouk");
});