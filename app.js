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

const DAY_SPECS = [
  { offset: -2, label: "Vorgestern" },
  { offset: -1, label: "Gestern" },
  { offset: 0, label: "Heute" },
  { offset: 1, label: "Morgen" },
  { offset: 2, label: "Übermorgen" }
];

let db = null;
let saveTimers = new Map();
let bravoTimer = null;

// Zeitpunkt des letzten Besuchs auf genau diesem iPhone.
const LAST_SEEN_KEY = "fivetodo_last_seen_at_v1";
const previousLastSeenAt = Number(localStorage.getItem(LAST_SEEN_KEY) || 0);
const sessionOpenedAt = Date.now();

let initialSnapshotsRemaining = DAY_SPECS.length;
let initialNewCount = 0;
const initialNewKeys = new Set();

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
    createdAt:0
  }));
}

function normalizeTodos(raw){
  const base = emptyTodos();
  if(!Array.isArray(raw)) return base;
  return base.map((item, i) => ({
    text: typeof raw[i]?.text === "string" ? raw[i].text : "",
    done: !!raw[i]?.done,
    createdAt: Number(raw[i]?.createdAt || 0)
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
  }, 3000);
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
    card.innerHTML = `
      <div class="day-head">
        <div class="day-title-wrap">
          <span class="day-label">${info.label}</span>
          <span class="day-date">${formatDate(info.date)}</span>
        </div>
        <span class="day-count" id="count-${info.key}">0/10</span>
      </div>
      <div class="todo-list">
        ${Array.from({length:10}, (_, i) => `
          <label class="todo-row" data-index="${i}">
            <input class="check" type="checkbox" aria-label="Todo ${i+1} erledigt">
            <input class="todo-input" maxlength="140" placeholder="Todo ${i+1}" autocomplete="off" enterkeyhint="done">
          </label>
        `).join("")}
      </div>
    `;
    daysEl.appendChild(card);
  }
}

function isNewForThisVisit(todo){
  return !!todo.text &&
    todo.createdAt > 0 &&
    todo.createdAt > previousLastSeenAt;
}

function applyTodos(dateKey, todos, collectInitialNew=false){
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
    row.classList.toggle("done", todo.done);

    const newKey = `${dateKey}:${i}`;
    const isNew = isNewForThisVisit(todo);

    row.classList.toggle("is-new", isNew);

    if(collectInitialNew && isNew && !initialNewKeys.has(newKey)){
      initialNewKeys.add(newKey);
      initialNewCount++;
    }
  });

  const doneCount = norm.filter(t => t.done).length;
  const count = document.getElementById(`count-${dateKey}`);
  if(count) count.textContent = `${doneCount}/10`;
}

function readCardTodos(dateKey){
  const card = document.querySelector(`[data-date="${dateKey}"]`);
  if(!card) return emptyTodos();

  return [...card.querySelectorAll(".todo-row")].map(row => {
    const input = row.querySelector(".todo-input");
    const check = row.querySelector(".check");
    return {
      text: input.value.trimEnd(),
      done: check.checked,
      createdAt: Number(row.dataset.createdAt || 0)
    };
  });
}

function hydrateCreatedAtIntoRows(dateKey, todos){
  const card = document.querySelector(`[data-date="${dateKey}"]`);
  if(!card) return;
  const norm = normalizeTodos(todos);
  norm.forEach((todo, i) => {
    const row = card.querySelector(`[data-index="${i}"]`);
    if(row) row.dataset.createdAt = String(todo.createdAt || 0);
  });
}

function queueSave(dateKey, delay=220){
  clearTimeout(saveTimers.get(dateKey));
  saveTimers.set(dateKey, setTimeout(() => saveDay(dateKey), delay));
}

async function saveDay(dateKey){
  if(!db) return;
  try{
    const todos = readCardTodos(dateKey);
    await setDoc(doc(db, "days", dateKey), {
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

    // Wird aus einem leeren Todo erstmals ein echtes Todo, erhält es einen Erstellzeitpunkt.
    if(e.target.value.trim() && Number(row.dataset.createdAt || 0) === 0){
      row.dataset.createdAt = String(Date.now());
    }

    // Wird ein noch nicht gespeichertes Todo wieder komplett geleert, Zeitstempel zurücksetzen.
    if(!e.target.value.trim() && !e.target.dataset.wasSaved){
      row.dataset.createdAt = "0";
    }

    queueSave(card.dataset.date);
  });

  daysEl.addEventListener("change", e => {
    if(!e.target.classList.contains("check")) return;

    const row = e.target.closest(".todo-row");
    const card = e.target.closest(".day-card");
    row.classList.toggle("done", e.target.checked);

    const dateKey = card.dataset.date;
    applyTodos(dateKey, readCardTodos(dateKey));
    queueSave(dateKey, 0);

    if(e.target.checked) showBravo();
  });
}

function firebaseLooksConfigured(){
  const c = window.FIREBASE_CONFIG;
  return c && Object.values(c).every(v =>
    typeof v === "string" && v && !v.includes("HIER_EINTRAGEN")
  );
}

function finishInitialNewCheck(){
  showNewTasksBanner(initialNewCount);

  // Nach dem Laden gilt alles bis zu diesem Öffnen als gesehen.
  // Eine während derselben Sitzung neu eingetragene Aufgabe wird weiterhin live markiert,
  // beim nächsten Öffnen aber nicht noch einmal als "neu seit letztem Besuch" gezählt.
  localStorage.setItem(LAST_SEEN_KEY, String(sessionOpenedAt));
}

async function start(){
  renderShell();
  bindInputs();

  if(!firebaseLooksConfigured()){
    setStatus("offline","Firebase fehlt");
    for(const info of getDayInfo()) applyTodos(info.key, emptyTodos());
    return;
  }

  try{
    const app = initializeApp(window.FIREBASE_CONFIG);
    db = getFirestore(app);
    setStatus("","Verbinde…");

    for(const info of getDayInfo()){
      let firstSnapshot = true;

      onSnapshot(doc(db, "days", info.key), snap => {
        const todos = snap.exists() ? snap.data().todos : emptyTodos();

        hydrateCreatedAtIntoRows(info.key, todos);
        applyTodos(info.key, todos, firstSnapshot);

        setStatus("online","Live");

        if(firstSnapshot){
          firstSnapshot = false;
          initialSnapshotsRemaining--;
          if(initialSnapshotsRemaining === 0){
            finishInitialNewCheck();
          }
        }
      }, err => {
        console.error(err);
        setStatus("offline","Offline");

        if(firstSnapshot){
          firstSnapshot = false;
          initialSnapshotsRemaining--;
          if(initialSnapshotsRemaining === 0){
            finishInitialNewCheck();
          }
        }
      });
    }
  }catch(err){
    console.error(err);
    setStatus("offline","Fehler");
  }
}

if("serviceWorker" in navigator){
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

start();
