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
  return Array.from({length:10}, () => ({text:"", done:false}));
}

function normalizeTodos(raw){
  const base = emptyTodos();
  if(!Array.isArray(raw)) return base;
  return base.map((item, i) => ({
    text: typeof raw[i]?.text === "string" ? raw[i].text : "",
    done: !!raw[i]?.done
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
    row.classList.toggle("done", todo.done);
  });
  const doneCount = norm.filter(t => t.done).length;
  const count = document.getElementById(`count-${dateKey}`);
  if(count) count.textContent = `${doneCount}/10`;
}

function readCardTodos(dateKey){
  const card = document.querySelector(`[data-date="${dateKey}"]`);
  if(!card) return emptyTodos();
  return [...card.querySelectorAll(".todo-row")].map(row => ({
    text: row.querySelector(".todo-input").value.trimEnd(),
    done: row.querySelector(".check").checked
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
    const card = e.target.closest(".day-card");
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
  return c && Object.values(c).every(v => typeof v === "string" && v && !v.includes("HIER_EINTRAGEN"));
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
      onSnapshot(doc(db, "days", info.key), snap => {
        applyTodos(info.key, snap.exists() ? snap.data().todos : emptyTodos());
        setStatus("online","Live");
      }, err => {
        console.error(err);
        setStatus("offline","Offline");
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
