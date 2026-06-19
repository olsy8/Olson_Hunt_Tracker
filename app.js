const storageKey = "olson-hunt-tracker.entries";
const activeTripKey = "olson-hunt-tracker.activeTrip";

const fields = [
  "date",
  "huntDay",
  "title",
  "tripName",
  "location",
  "species",
  "startTime",
  "endTime",
  "miles",
  "weather",
  "temperature",
  "wind",
  "light",
  "companions",
  "hunters",
  "campLog",
  "sightings",
  "moments",
  "lessonsLearned",
  "quoteOfTheDay",
  "harvest",
  "videoNotes",
  "tags",
];

const checkboxFields = ["animalKilled"];

const form = document.querySelector("#entryForm");
const entryId = document.querySelector("#entryId");
const toast = document.querySelector("#toast");
const entryList = document.querySelector("#entryList");
const storyboard = document.querySelector("#storyboard");
const tripSummary = document.querySelector("#tripSummary");
const markdownOutput = document.querySelector("#markdownOutput");
const searchEntries = document.querySelector("#searchEntries");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");
const signInButton = document.querySelector("#signInButton");
const createAccountButton = document.querySelector("#createAccountButton");
const signOutButton = document.querySelector("#signOutButton");
const syncStatus = document.querySelector("#syncStatus");
const syncDetail = document.querySelector("#syncDetail");

let entries = loadEntries();
let auth = null;
let currentUser = null;
let db = null;
let unsubscribeEntries = null;

const firebaseConfig = {
  apiKey: "AIzaSyAW7om1bjIk_7rop_sxPiz_7Xk8tusUd34",
  authDomain: "olson-hunt-tracker.firebaseapp.com",
  projectId: "olson-hunt-tracker",
  storageBucket: "olson-hunt-tracker.firebasestorage.app",
  messagingSenderId: "749084997385",
  appId: "1:749084997385:web:e754a851aa4d5b670b45d8",
  measurementId: "G-QCS22PHGFW",
};

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || [];
  } catch (error) {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(storageKey, JSON.stringify(entries));
}

function userEntriesCollection() {
  if (!db || !currentUser) return null;
  return db.collection("users").doc(currentUser.uid).collection("entries");
}

function setSyncStatus(status, detail) {
  syncStatus.textContent = status;
  syncDetail.textContent = detail;
}

function updateAuthUi(user) {
  const signedIn = Boolean(user);
  authEmail.hidden = signedIn;
  authPassword.hidden = signedIn;
  signInButton.hidden = signedIn;
  createAccountButton.hidden = signedIn;
  signOutButton.hidden = !signedIn;
  setSyncStatus(signedIn ? "Sync on" : "Local only", signedIn ? `Signed in as ${user.email}` : "Sign in to sync across devices.");
}

async function uploadLocalEntries() {
  const collection = userEntriesCollection();
  if (!collection || !entries.length) return;

  await Promise.all(
    entries.map((entry) => {
      const id = entry.id || uid();
      const syncedEntry = { ...entry, id, syncedAt: new Date().toISOString() };
      return collection.doc(id).set(syncedEntry, { merge: true });
    })
  );
}

function subscribeToCloudEntries() {
  const collection = userEntriesCollection();
  if (!collection) return;
  if (unsubscribeEntries) unsubscribeEntries();

  unsubscribeEntries = collection.onSnapshot(
    (snapshot) => {
      entries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      saveEntries();
      render();
      setSyncStatus("Sync on", `Signed in as ${currentUser.email}`);
    },
    (error) => {
      setSyncStatus("Sync paused", error.message);
    }
  );
}

async function saveCloudEntry(entry) {
  const collection = userEntriesCollection();
  if (!collection) return;
  await collection.doc(entry.id).set({ ...entry, syncedAt: new Date().toISOString() }, { merge: true });
}

async function deleteCloudEntry(id) {
  const collection = userEntriesCollection();
  if (!collection) return;
  await collection.doc(id).delete();
}

function initFirebase() {
  if (!window.firebase) {
    setSyncStatus("Local only", "Firebase scripts unavailable.");
    return;
  }

  try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      updateAuthUi(user);

      if (!user) {
        if (unsubscribeEntries) unsubscribeEntries();
        unsubscribeEntries = null;
        return;
      }

      try {
        await uploadLocalEntries();
        subscribeToCloudEntries();
      } catch (error) {
        setSyncStatus("Sync paused", error.message);
      }
    });
  } catch (error) {
    setSyncStatus("Local only", error.message);
  }
}

function saveActiveTrip(tripName) {
  if (tripName) {
    localStorage.setItem(activeTripKey, tripName);
  }
}

function activeTrip() {
  return localStorage.getItem(activeTripKey) || "";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizedTripName(value) {
  return value.trim().toLowerCase();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1900);
}

function collectForm() {
  const data = Object.fromEntries(fields.map((field) => [field, document.querySelector(`#${field}`).value.trim()]));
  checkboxFields.forEach((field) => {
    data[field] = document.querySelector(`#${field}`).checked;
  });
  return {
    id: entryId.value || uid(),
    updatedAt: new Date().toISOString(),
    ...data,
  };
}

function syncHarvestVisibility() {
  const harvestField = document.querySelector("#harvestField");
  const shouldShow = document.querySelector("#animalKilled").checked;
  harvestField.hidden = !shouldShow;
  harvestField.style.display = shouldShow ? "" : "none";
}

function fillForm(entry) {
  entryId.value = entry.id;
  fields.forEach((field) => {
    document.querySelector(`#${field}`).value = entry[field] || "";
  });
  checkboxFields.forEach((field) => {
    document.querySelector(`#${field}`).checked = Boolean(entry[field]);
  });
  syncHarvestVisibility();
  switchView("logView");
  document.querySelector("#title").focus();
}

function clearForm(options = {}) {
  const tripToKeep = options.keepTrip ? document.querySelector("#tripName").value.trim() || activeTrip() : activeTrip();
  form.reset();
  entryId.value = "";
  document.querySelector("#date").value = today();
  document.querySelector("#tripName").value = tripToKeep;
  applyTripDaySuggestion();
  syncHarvestVisibility();
}

function tripDayForDate(tripName, date, currentEntryId = "") {
  const trip = normalizedTripName(tripName);
  if (!trip || !date) return "";

  const tripDates = entries
    .filter((entry) => entry.id !== currentEntryId)
    .filter((entry) => normalizedTripName(entry.tripName || "") === trip)
    .map((entry) => entry.date)
    .filter(Boolean);

  const uniqueDates = Array.from(new Set(tripDates.concat(date))).sort();
  return String(uniqueDates.indexOf(date) + 1);
}

function applyTripDaySuggestion() {
  const tripName = document.querySelector("#tripName").value;
  const date = document.querySelector("#date").value;
  const suggestedDay = tripDayForDate(tripName, date, entryId.value);
  if (suggestedDay) {
    document.querySelector("#huntDay").value = suggestedDay;
  }
}

function sortEntries(list) {
  return [...list].sort((a, b) => {
    const dayA = Number(a.huntDay) || 0;
    const dayB = Number(b.huntDay) || 0;
    return (b.date || "").localeCompare(a.date || "") || dayB - dayA;
  });
}

function formatDate(value) {
  if (!value) return "Undated";
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function tagsFor(entry) {
  return (entry.tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function huntersFor(entry) {
  return (entry.hunters || entry.companions || "")
    .split(",")
    .map((hunter) => hunter.trim())
    .filter(Boolean);
}

function matchingEntries() {
  const query = searchEntries.value.trim().toLowerCase();
  const sorted = sortEntries(entries);
  if (!query) return sorted;
  return sorted.filter((entry) => JSON.stringify(entry).toLowerCase().includes(query));
}

function groupedByTrip(list) {
  const groupedEntries = list.reduce((groups, entry) => {
    const tripName = entry.tripName || "Ungrouped hunt";
    if (!groups.has(tripName)) groups.set(tripName, []);
    groups.get(tripName).push(entry);
    return groups;
  }, new Map());

  return Array.from(groupedEntries.entries())
    .map(([tripName, tripEntries]) => {
      const sortedTripEntries = [...tripEntries].sort((a, b) => {
        const dayA = Number(a.huntDay) || 0;
        const dayB = Number(b.huntDay) || 0;
        return dayA - dayB || (a.date || "").localeCompare(b.date || "");
      });
      return [tripName, sortedTripEntries];
    })
    .sort((a, b) => {
      const latestA = sortEntries(a[1])[0];
      const latestB = sortEntries(b[1])[0];
      return (latestB.date || "").localeCompare(latestA.date || "");
    });
}

function renderSummary() {
  document.querySelector("#totalEntries").textContent = entries.length;
  document.querySelector("#huntDays").textContent = new Set(entries.map((entry) => entry.date).filter(Boolean)).size;
}

function renderTripSuggestions() {
  const tripSuggestions = document.querySelector("#tripSuggestions");
  const trips = Array.from(new Set(entries.map((entry) => entry.tripName).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  tripSuggestions.innerHTML = trips.map((trip) => `<option value="${escapeHtml(trip)}"></option>`).join("");
}

function renderHunterSuggestions() {
  const hunterSuggestions = document.querySelector("#hunterSuggestions");
  const hunters = Array.from(new Set(entries.flatMap((entry) => huntersFor(entry)))).sort((a, b) => a.localeCompare(b));
  hunterSuggestions.innerHTML = hunters.map((hunter) => `<option value="${escapeHtml(hunter)}"></option>`).join("");
}

function renderTimeline() {
  const list = matchingEntries();
  entryList.innerHTML = "";

  if (!list.length) {
    entryList.innerHTML = `<div class="empty-state">No matching hunt entries yet.</div>`;
    return;
  }

  const groups = groupedByTrip(list);

  groups.forEach(([tripName, tripEntries]) => {
    const section = document.createElement("section");
    section.className = "trip-group";
    const dayCount = new Set(tripEntries.map((entry) => entry.date).filter(Boolean)).size;
    section.innerHTML = `
      <div class="trip-group-head">
        <h3>${escapeHtml(tripName)}</h3>
        <span>${dayCount} ${dayCount === 1 ? "day" : "days"} · ${tripEntries.length} ${tripEntries.length === 1 ? "entry" : "entries"}</span>
      </div>
    `;

    tripEntries.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "entry-card";
      const harvestTag = entry.animalKilled ? `<span class="tag harvested">Animal killed</span>` : "";
      const tagHtml = harvestTag + tagsFor(entry).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
      card.innerHTML = `
        <div class="entry-head">
          <div>
            <h3>${entry.huntDay ? `Day ${escapeHtml(entry.huntDay)} · ` : ""}${escapeHtml(entry.title || "Untitled hunt")}</h3>
            <div class="entry-meta">${formatDate(entry.date)}${entry.location ? ` · ${escapeHtml(entry.location)}` : ""}</div>
          </div>
        </div>
        <p>${escapeHtml(entry.moments || entry.sightings || "No story notes yet.")}</p>
        ${entry.quoteOfTheDay ? `<p class="quote-line">"${escapeHtml(entry.quoteOfTheDay)}"</p>` : ""}
        ${tagHtml ? `<div class="tag-row">${tagHtml}</div>` : ""}
        <div class="card-actions">
          <button class="small-button" type="button" data-edit="${entry.id}">Edit</button>
          <button class="small-button delete" type="button" data-delete="${entry.id}">Delete</button>
        </div>
      `;
      section.append(card);
    });

    entryList.append(section);
  });
}

function renderStoryboard() {
  const list = sortEntries(entries);
  storyboard.innerHTML = "";

  if (!list.length) {
    storyboard.innerHTML = `<div class="empty-state">Saved entries will become a day-by-day recall sheet for your edit.</div>`;
    return;
  }

  list.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "story-card";
    card.innerHTML = `
      <h3>${formatDate(entry.date)}${entry.title ? ` · ${escapeHtml(entry.title)}` : ""}</h3>
      <dl>
        <dt>Trip</dt><dd>${escapeHtml(entry.tripName || "Not logged")}</dd>
        <dt>Context</dt><dd>${escapeHtml([entry.location, entry.species, entry.weather].filter(Boolean).join(" · ") || "Not logged")}</dd>
        <dt>Timeline</dt><dd>${escapeHtml([entry.startTime, entry.endTime].filter(Boolean).join(" to ") || "Not logged")}</dd>
        <dt>Hunters</dt><dd>${escapeHtml(huntersFor(entry).join(", ") || "Not logged")}</dd>
        <dt>Camp</dt><dd>${escapeHtml(entry.campLog || "Not logged")}</dd>
        <dt>Sightings</dt><dd>${escapeHtml(entry.sightings || "Not logged")}</dd>
        <dt>Moments</dt><dd>${escapeHtml(entry.moments || "Not logged")}</dd>
        <dt>Lessons</dt><dd>${escapeHtml(entry.lessonsLearned || "Not logged")}</dd>
        <dt>Quote</dt><dd>${escapeHtml(entry.quoteOfTheDay || "Not logged")}</dd>
        <dt>Animal</dt><dd>${entry.animalKilled ? "Killed" : "Not killed"}</dd>
        <dt>Harvest</dt><dd>${escapeHtml(entry.harvest || "Not logged")}</dd>
        <dt>Video</dt><dd>${escapeHtml(entry.videoNotes || "Not logged")}</dd>
      </dl>
    `;
    storyboard.append(card);
  });
}

function firstFilled(list, field) {
  const entry = list.find((item) => item[field]);
  return entry ? entry[field] : "";
}

function summarizeTripEntries(tripEntries) {
  const uniqueDates = Array.from(new Set(tripEntries.map((entry) => entry.date).filter(Boolean))).sort();
  const species = Array.from(new Set(tripEntries.map((entry) => entry.species).filter(Boolean)));
  const animalsKilled = tripEntries.filter((entry) => entry.animalKilled).length;
  const dateRange = uniqueDates.length
    ? uniqueDates.length === 1
      ? formatDate(uniqueDates[0])
      : `${formatDate(uniqueDates[0])} to ${formatDate(uniqueDates[uniqueDates.length - 1])}`
    : "No dates";

  return {
    animalsKilled,
    dateRange,
    dayCount: uniqueDates.length,
    entryCount: tripEntries.length,
    keyVideoNotes: firstFilled(tripEntries, "videoNotes"),
    latestLesson: firstFilled([...tripEntries].reverse(), "lessonsLearned"),
    bestQuote: firstFilled(tripEntries, "quoteOfTheDay"),
    species: species.length ? species.join(", ") : "Not logged",
  };
}

function hunterSpeciesYearRows(tripEntries) {
  const totals = new Map();

  tripEntries.forEach((entry) => {
    const date = entry.date || "";
    const year = date ? date.slice(0, 4) : "Undated";
    const species = entry.species || "Unknown";
    huntersFor(entry).forEach((hunter) => {
      const key = `${hunter}|||${species}|||${year}`;
      if (!totals.has(key)) {
        totals.set(key, {
          dates: new Set(),
          hunter,
          species,
          year,
        });
      }
      if (date) totals.get(key).dates.add(date);
    });
  });

  return Array.from(totals.values())
    .map((row) => ({
      days: row.dates.size,
      hunter: row.hunter,
      species: row.species,
      year: row.year,
    }))
    .sort((a, b) => a.year.localeCompare(b.year) || a.hunter.localeCompare(b.hunter) || a.species.localeCompare(b.species));
}

function renderTripSummary() {
  const groups = groupedByTrip(entries);
  tripSummary.innerHTML = "";

  if (!groups.length) {
    tripSummary.innerHTML = `<div class="empty-state">Trip summaries will appear after you save hunt entries.</div>`;
    return;
  }

  groups.forEach(([tripName, tripEntries]) => {
    const summary = summarizeTripEntries(tripEntries);
    const hunterRows = hunterSpeciesYearRows(tripEntries);
    const dayOutline = tripEntries
      .map((entry) => `${entry.huntDay ? `Day ${escapeHtml(entry.huntDay)}` : formatDate(entry.date)}: ${escapeHtml(entry.title || "Untitled hunt")}`)
      .join("<br />");
    const hunterRowsHtml = hunterRows.length
      ? hunterRows
          .map((row) => `<tr><td>${escapeHtml(row.hunter)}</td><td>${escapeHtml(row.year)}</td><td>${escapeHtml(row.species)}</td><td>${row.days}</td></tr>`)
          .join("")
      : `<tr><td colspan="4">No hunters logged yet.</td></tr>`;
    const card = document.createElement("article");
    card.className = "summary-card";
    card.innerHTML = `
      <h3>${escapeHtml(tripName)}</h3>
      <div class="summary-stats">
        <div><strong>${summary.dayCount}</strong><span>${summary.dayCount === 1 ? "day" : "days"}</span></div>
        <div><strong>${summary.entryCount}</strong><span>${summary.entryCount === 1 ? "entry" : "entries"}</span></div>
        <div><strong>${summary.animalsKilled}</strong><span>killed</span></div>
      </div>
      <table class="hunter-table">
        <thead><tr><th>Hunter</th><th>Year</th><th>Species</th><th>Days</th></tr></thead>
        <tbody>${hunterRowsHtml}</tbody>
      </table>
      <dl>
        <dt>Dates</dt><dd>${escapeHtml(summary.dateRange)}</dd>
        <dt>Target</dt><dd>${escapeHtml(summary.species)}</dd>
        <dt>Outline</dt><dd>${dayOutline || "Not logged"}</dd>
        <dt>Lesson</dt><dd>${escapeHtml(summary.latestLesson || "Not logged")}</dd>
        <dt>Quote</dt><dd>${escapeHtml(summary.bestQuote || "Not logged")}</dd>
        <dt>Video</dt><dd>${escapeHtml(summary.keyVideoNotes || "Not logged")}</dd>
      </dl>
    `;
    tripSummary.append(card);
  });
}

function render() {
  renderSummary();
  renderTripSuggestions();
  renderHunterSuggestions();
  renderTimeline();
  renderStoryboard();
  renderTripSummary();
}

function switchView(id) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === id));
}

function exportBlob(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 1000);
}

function toCsvValue(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

function exportCsv() {
  const columns = ["date", "huntDay", "title", "tripName", "location", "species", "hunters", "animalKilled", "weather", "temperature", "wind", "campLog", "sightings", "moments", "lessonsLearned", "quoteOfTheDay", "harvest", "videoNotes", "tags"];
  const rows = [columns.join(",")].concat(sortEntries(entries).map((entry) => columns.map((column) => toCsvValue(entry[column])).join(",")));
  exportBlob("olson-hunt-tracker.csv", "text/csv", rows.join("\n"));
}

function storyboardText() {
  return sortEntries(entries)
    .map((entry) => {
      return [
        `${formatDate(entry.date)} - ${entry.title || "Untitled hunt"}`,
        `Trip: ${entry.tripName || "Not logged"}`,
        `Context: ${[entry.location, entry.species, entry.weather].filter(Boolean).join(" · ") || "Not logged"}`,
        `Hunters: ${huntersFor(entry).join(", ") || "Not logged"}`,
        `Camp log: ${entry.campLog || "Not logged"}`,
        `Sightings: ${entry.sightings || "Not logged"}`,
        `Moments: ${entry.moments || "Not logged"}`,
        `Lessons learned: ${entry.lessonsLearned || "Not logged"}`,
        `Quote of the day: ${entry.quoteOfTheDay || "Not logged"}`,
        `Animal killed: ${entry.animalKilled ? "Yes" : "No"}`,
        `Harvest: ${entry.harvest || "Not logged"}`,
        `Video notes: ${entry.videoNotes || "Not logged"}`,
      ].join("\n");
    })
    .join("\n\n");
}

function markdownValue(value) {
  return value || "Not logged";
}

function markdownExportText() {
  const groups = groupedByTrip(entries);
  const lines = ["# Olson Hunt Tracker", ""];

  if (!groups.length) {
    lines.push("No hunt entries logged yet.");
    return lines.join("\n");
  }

  groups.forEach(([tripName, tripEntries]) => {
    const summary = summarizeTripEntries(tripEntries);
    const hunterRows = hunterSpeciesYearRows(tripEntries);
    lines.push(`## ${tripName}`, "");
    lines.push(`- Dates: ${summary.dateRange}`);
    lines.push(`- Days: ${summary.dayCount}`);
    lines.push(`- Entries: ${summary.entryCount}`);
    lines.push(`- Target: ${summary.species}`);
    lines.push(`- Animals killed: ${summary.animalsKilled}`);
    lines.push(`- Best quote: ${markdownValue(summary.bestQuote)}`);
    lines.push(`- Biggest lesson: ${markdownValue(summary.latestLesson)}`);
    lines.push("");
    lines.push("### Hunter Days");
    lines.push("");

    if (hunterRows.length) {
      lines.push("| Hunter | Year | Species | Days |");
      lines.push("| --- | --- | --- | ---: |");
      hunterRows.forEach((row) => {
        lines.push(`| ${row.hunter} | ${row.year} | ${row.species} | ${row.days} |`);
      });
    } else {
      lines.push("No hunters logged.");
    }

    lines.push("");

    tripEntries.forEach((entry) => {
      lines.push(`### ${entry.huntDay ? `Day ${entry.huntDay}` : formatDate(entry.date)}: ${entry.title || "Untitled hunt"}`);
      lines.push("");
      lines.push(`- Date: ${formatDate(entry.date)}`);
      lines.push(`- Area: ${markdownValue(entry.location)}`);
      lines.push(`- Hunters: ${huntersFor(entry).join(", ") || "Not logged"}`);
      lines.push(`- Weather: ${[entry.weather, entry.temperature, entry.wind].filter(Boolean).join(" | ") || "Not logged"}`);
      lines.push(`- Camp log: ${markdownValue(entry.campLog)}`);
      lines.push(`- Sightings: ${markdownValue(entry.sightings)}`);
      lines.push(`- Key moments: ${markdownValue(entry.moments)}`);
      lines.push(`- Lessons learned: ${markdownValue(entry.lessonsLearned)}`);
      lines.push(`- Quote of the day: ${markdownValue(entry.quoteOfTheDay)}`);
      lines.push(`- Animal killed: ${entry.animalKilled ? "Yes" : "No"}`);
      lines.push(`- Harvest details: ${markdownValue(entry.harvest)}`);
      lines.push(`- Video notes: ${markdownValue(entry.videoNotes)}`);
      lines.push("");
    });
  });

  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  applyTripDaySuggestion();
  const entry = collectForm();
  const index = entries.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    entries[index] = entry;
  } else {
    entries.push(entry);
  }
  saveActiveTrip(entry.tripName);
  saveEntries();
  saveCloudEntry(entry).catch((error) => setSyncStatus("Sync paused", error.message));
  clearForm({ keepTrip: true });
  render();
  showToast("Hunt entry saved");
});

document.querySelector("#clearForm").addEventListener("click", clearForm);
document.querySelector("#date").addEventListener("change", applyTripDaySuggestion);
document.querySelector("#tripName").addEventListener("input", applyTripDaySuggestion);
document.querySelector("#animalKilled").addEventListener("change", syncHarvestVisibility);
signInButton.addEventListener("click", async () => {
  if (!auth) {
    showToast("Firebase is not available");
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(authEmail.value.trim(), authPassword.value);
    authPassword.value = "";
    showToast("Signed in");
  } catch (error) {
    showToast(error.message);
  }
});
createAccountButton.addEventListener("click", async () => {
  if (!auth) {
    showToast("Firebase is not available");
    return;
  }

  try {
    await auth.createUserWithEmailAndPassword(authEmail.value.trim(), authPassword.value);
    authPassword.value = "";
    showToast("Account created");
  } catch (error) {
    showToast(error.message);
  }
});
signOutButton.addEventListener("click", async () => {
  if (!auth) return;
  await auth.signOut();
  showToast("Signed out");
});
document.querySelector("#exportCsv").addEventListener("click", exportCsv);
document.querySelector("#exportJson").addEventListener("click", () => {
  exportBlob("olson-hunt-tracker.json", "application/json", JSON.stringify(sortEntries(entries), null, 2));
});
document.querySelector("#exportMarkdown").addEventListener("click", async () => {
  const markdown = markdownExportText();
  markdownOutput.hidden = false;
  markdownOutput.value = markdown;
  exportBlob("olson-hunt-tracker.md", "text/markdown;charset=utf-8", markdown);

  try {
    await navigator.clipboard.writeText(markdown);
    showToast("Markdown downloaded and copied");
  } catch (error) {
    markdownOutput.focus();
    markdownOutput.select();
    showToast("Markdown ready below");
  }
});

document.querySelector("#copyStoryboard").addEventListener("click", async () => {
  await navigator.clipboard.writeText(storyboardText());
  showToast("Video recall notes copied");
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

entryList.addEventListener("click", (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;

  if (editId) {
    const entry = entries.find((item) => item.id === editId);
    if (entry) fillForm(entry);
  }

  if (deleteId) {
    entries = entries.filter((item) => item.id !== deleteId);
    saveEntries();
    deleteCloudEntry(deleteId).catch((error) => setSyncStatus("Sync paused", error.message));
    render();
    showToast("Entry deleted");
  }
});

searchEntries.addEventListener("input", renderTimeline);

clearForm();
render();
initFirebase();
