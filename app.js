const STORAGE_KEY = "gymTracker.workouts";
const generateId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

const form = document.querySelector("#workoutForm");
const reminderList = document.querySelector("#reminderList");
// const summaryCards = document.querySelector("#summaryCards");
const formFeedback = document.querySelector("#formFeedback");
const statNumbers = document.querySelector("#statNumbers");
const tabs = document.querySelectorAll(".tab");
const mediaUrlInput = form.elements.mediaUrl;
const mediaTypeSelect = form.elements.mediaType;
const mediaFileInput = form.elements.mediaFile;
const mediaPreview = document.querySelector("#mediaPreview");
const clearMediaBtn = document.querySelector("#clearMediaBtn");
const statsCanvas = document.querySelector("#statsChart");
const workoutFilterSelect = document.querySelector("#workoutFilter");
const pyramidRows = Array.from(document.querySelectorAll(".pyramid-row"));
const fieldErrorElements = Array.from(
  document.querySelectorAll("[data-error-for]")
);
const fieldErrorMap = fieldErrorElements.reduce((acc, el) => {
  acc[el.dataset.errorFor] = el;
  return acc;
}, {});
const workoutLogContainer = document.querySelector("#workoutLog");
const calendarGrid = document.querySelector("#calendarGrid");
const calendarMonthLabel = document.querySelector("#calendarMonthLabel");
const calendarSelectedDateLabel = document.querySelector(
  "#calendarSelectedDate"
);
const calendarWorkoutList = document.querySelector("#calendarWorkoutList");
const prevMonthBtn = document.querySelector("#prevMonthBtn");
const nextMonthBtn = document.querySelector("#nextMonthBtn");
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let workouts = loadWorkouts();
let editingId = null;
let activeRange = "daily";
let statsChart = null;
let calendarCursor = startOfMonth(new Date());
let selectedCalendarKey = dateKey(new Date());
let mediaUploadData = null;
let statsWorkoutFilter = "all";

init();
// document.addEventListener("DOMContentLoaded", () => {
//     init();
//   });
function init() {
//   renderSummary();
  renderReminders();
  populateWorkoutFilter();
  initChart();
  updateStats();
  renderWorkoutLog();
  renderCalendar();
  renderCalendarDetails();
  setupListeners();
  updateMediaPreview();
  fillPyramidRows();
}

function setupListeners() {
  form.addEventListener("submit", handleSubmit);
  reminderList.addEventListener("click", handleReminderActions);
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => changeRange(tab.dataset.range))
  );
  mediaUrlInput.addEventListener("input", updateMediaPreview);
  mediaTypeSelect.addEventListener("change", updateMediaPreview);
  if (mediaFileInput) {
    mediaFileInput.addEventListener("change", handleMediaFile);
  }
  if (clearMediaBtn) {
    clearMediaBtn.addEventListener("click", () => clearMediaUpload(true));
  }
  if (workoutFilterSelect) {
    workoutFilterSelect.addEventListener("change", handleWorkoutFilterChange);
  }
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener("click", () => shiftCalendarMonth(-1));
  }
  if (nextMonthBtn) {
    nextMonthBtn.addEventListener("click", () => shiftCalendarMonth(1));
  }
  if (calendarGrid) {
    calendarGrid.addEventListener("click", handleCalendarClick);
  }
}

function handleSubmit(event) {
  event.preventDefault();
  const data = new FormData(form);

  const name = data.get("name").trim();
  const date = data.get("date");
  const mediaUrl = data.get("mediaUrl").trim();
  const mediaType = data.get("mediaType");
  const notes = data.get("notes").trim();
  const reminderOffset = Number(data.get("reminderOffset") ?? 0);
  const completed = data.get("completed") === "on";
  const selectedDate = date ? parseLocalDate(date) : null;
  const pyramidInputs = readPyramidInputs();

  clearFieldErrors();
  const validationErrors = validateForm({
    name,
    selectedDate,
    mediaUrl,
    reminderOffset,
  });
  const {
    entries: pyramidSets,
    totalSets,
    totalReps,
    totalWeight,
    totalVolume,
    errors: pyramidErrors,
  } = validatePyramid(pyramidInputs);
  const mediaSource = buildMediaSource(mediaUrl, mediaType);
  const resolvedMediaType = mediaSource?.type || mediaType;
  const resolvedMediaUrl =
    mediaSource && mediaSource.mode === "url" ? mediaSource.url : "";

  if (pyramidErrors.length) {
    setFieldError("pyramid", pyramidErrors[0]);
  }

  if (Object.keys(validationErrors).length || pyramidErrors.length) {
    Object.entries(validationErrors).forEach(([field, message]) =>
      setFieldError(field, message)
    );
    showFormMessage("Please fix the highlighted fields.", true);
    return;
  }

  const workoutPayload = {
    id: editingId ?? generateId(),
    name,
    date,
    mediaUrl: resolvedMediaUrl,
    mediaType: resolvedMediaType,
    notes,
    reminderOffset,
    mediaSource,
    pyramidSets,
    totalSets,
    totalReps,
    totalWeight,
    totalVolume,
    sets: totalSets,
    reps: totalReps,
    completed,
  };

  if (editingId) {
    workouts = workouts.map((w) =>
      w.id === editingId ? { ...w, ...workoutPayload } : w
    );
    showFormMessage("Workout updated successfully.");
  } else {
    workouts = [...workouts, workoutPayload];
    showFormMessage("Workout added successfully.");
  }

  editingId = null;
  form.reset();
  fillPyramidRows();
  clearMediaUpload(true);
  form.querySelector("button[type='submit']").innerHTML =
    '<i class="fa-solid fa-plus"></i> Save Workout';
  updateMediaPreview();
  if (selectedDate) {
    selectedCalendarKey = dateKey(selectedDate);
    calendarCursor = startOfMonth(selectedDate);
  }

  persistAndRender();
}

function handleReminderActions(event) {
  const button = event.target.closest("button");
  if (!button) return;

  const item = event.target.closest(".reminder-item");
  if (!item) return;
  const id = item.dataset.id;

  if (button.classList.contains("complete-btn")) {
    toggleComplete(id);
  } else if (button.classList.contains("delete-btn")) {
    deleteWorkout(id);
  } else if (button.classList.contains("edit-btn")) {
    populateForm(id);
  }
}

function toggleComplete(id) {
  workouts = workouts.map((w) =>
    w.id === id ? { ...w, completed: !w.completed } : w
  );
  persistAndRender();
}

function deleteWorkout(id) {
  workouts = workouts.filter((w) => w.id !== id);
  persistAndRender();
}

function populateForm(id) {
  const workout = workouts.find((w) => w.id === id);
  if (!workout) return;

  editingId = workout.id;
  form.elements.name.value = workout.name;
  form.elements.date.value = workout.date;
  form.elements.notes.value = workout.notes;
  form.elements.reminderOffset.value = workout.reminderOffset ?? 0;
  if (form.elements.completed) {
    form.elements.completed.checked = workout.completed || false;
  }
  fillPyramidRows(workout);
  const mediaInfo = resolveMedia(workout);
  if (mediaInfo?.mode === "url") {
    form.elements.mediaUrl.value = mediaInfo.url;
    form.elements.mediaType.value = mediaInfo.type || "image";
    mediaUploadData = null;
  } else if (mediaInfo?.mode === "upload") {
    form.elements.mediaUrl.value = "";
    form.elements.mediaType.value = mediaInfo.type || "image";
    mediaUploadData = { ...mediaInfo };
  } else {
    form.elements.mediaUrl.value = workout.mediaUrl || "";
    form.elements.mediaType.value = workout.mediaType || "image";
    mediaUploadData = null;
  }
  form.querySelector("button[type='submit']").innerHTML =
    '<i class="fa-solid fa-floppy-disk"></i> Update Workout';
  updateMediaPreview();
  showFormMessage("Editing workout…", false);
}

function changeRange(range) {
  if (range === activeRange) return;
  activeRange = range;
  tabs.forEach((tab) =>
    tab.classList.toggle("active", tab.dataset.range === range)
  );
  updateStats();
}

function updateMediaPreview() {
  const uploaded = mediaUploadData?.url ? mediaUploadData : null;
  const url = uploaded?.url || mediaUrlInput.value.trim();
  const type = uploaded?.type || mediaTypeSelect.value;

  if (!url) {
    mediaPreview.innerHTML =
      "<p>Preview appears here when a media URL or upload is provided.</p>";
    return;
  }

  if (type === "image") {
    mediaPreview.innerHTML = `<img src="${url}" alt="Workout media preview" />`;
  } else {
    mediaPreview.innerHTML = `
      <div class="video-preview">
        <i class="fa-solid fa-video"></i>
        <p>Video preview ready. It will open in a new tab.</p>
      </div>`;
  }
}

// function renderSummary() {
//   const totalWorkouts = workouts.length;
//   const completed = workouts.filter((w) => w.completed).length;
//   const upcoming = workouts.filter((w) => isUpcoming(w.date)).length;
//   const totalSets = workouts.reduce((acc, w) => acc + getTotalSets(w), 0);
//   const totalWeight = workouts.reduce((acc, w) => acc + getTotalWeight(w), 0);
//   const totalVolume = workouts.reduce((acc, w) => acc + getTotalVolume(w), 0);

//   const cards = [
//     { label: "Total Workouts", value: totalWorkouts },
//     { label: "Upcoming", value: upcoming },
//     { label: "Completed", value: completed },
//     { label: "Sets Logged", value: totalSets },
//     { label: "Weight Lifted", value: formatWeightLabel(totalWeight) },
//     { label: "Volume (kg·reps)", value: formatNumber(totalVolume) },
//   ];

//   summaryCards.innerHTML = cards
//     .map(
//       (card) => `
//         <article class="summary-card">
//           <span>${card.label}</span>
//           <strong>${card.value}</strong>
//         </article>`
//     )
//     .join("");
// }

function renderReminders() {
  if (!workouts.length) {
    reminderList.innerHTML =
      "<li class='reminder-item empty'>No workouts scheduled yet.</li>";
    return;
  }

  const sorted = [...workouts].sort(
    (a, b) => parseLocalDate(a.date) - parseLocalDate(b.date)
  );

  reminderList.innerHTML = "";
  const template = document.querySelector("#reminderItemTemplate");

  sorted.forEach((workout) => {
    const clone = template.content.cloneNode(true);
    const item = clone.querySelector(".reminder-item");
    item.dataset.id = workout.id;

    const media = clone.querySelector(".reminder-media");
    const mediaInfo = resolveMedia(workout);
    if (mediaInfo?.type === "image" && mediaInfo.url) {
      media.innerHTML = `<img src="${mediaInfo.url}" alt="${workout.name}" />`;
    } else if (mediaInfo?.type === "video" && mediaInfo.url) {
      media.innerHTML = `<i class="fa-solid fa-video"></i>`;
    } else {
      media.innerHTML = `<i class="fa-solid fa-dumbbell"></i>`;
    }

    clone.querySelector("h3").textContent = workout.name;

    const badge = clone.querySelector(".badge");
    const scheduleLabel = getScheduleLabel(workout);
    badge.textContent = scheduleLabel.text;
    badge.classList.add(scheduleLabel.className);

    const reminderText = describeReminder(workout.reminderOffset);
    const reminderDate = reminderDateText(workout.date, workout.reminderOffset);
    const totalSets = getTotalSets(workout);
    const totalReps = getTotalReps(workout);
    const totalWeight = getTotalWeight(workout);
    clone.querySelector(
      ".meta"
    ).innerHTML = `${formatDate(
      workout.date
    )} • ${totalSets} sets x ${totalReps} reps • ${formatWeightLabel(
      totalWeight
    )}<br /><span class="reminder-hint">${reminderText}${
      reminderDate ? ` (${reminderDate})` : ""
    }</span>`;
    clone.querySelector(".notes").textContent = workout.notes || "No notes";

    const actions = clone.querySelector(".actions");

    const completeBtn = clone.querySelector(".complete-btn");
    completeBtn.innerHTML = workout.completed
      ? '<i class="fa-solid fa-rotate-left"></i> Undo'
      : '<i class="fa-solid fa-check"></i> Complete';

    if (workout.completed) {
      item.classList.add("completed");
    }

    const editBtn = document.createElement("button");
    editBtn.className = "ghost-btn edit-btn";
    editBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Edit';
    actions.insertBefore(editBtn, actions.firstChild);

    reminderList.appendChild(clone);
  });
}

function renderWorkoutLog() {
  if (!workoutLogContainer) return;
  if (!workouts.length) {
    workoutLogContainer.innerHTML =
      "<p class='muted-text'>No workouts logged yet.</p>";
    return;
  }

  const sorted = [...workouts].sort(
    (a, b) => parseLocalDate(b.date) - parseLocalDate(a.date)
  );

  const cards = sorted
    .map((workout) => {
      const totalSets = getTotalSets(workout);
      const totalReps = getTotalReps(workout);
      const totalWeight = getTotalWeight(workout);
      const totalVolume = getTotalVolume(workout);
      const status = workout.completed
        ? "Completed"
        : isUpcoming(workout.date)
        ? "Upcoming"
        : "Past";
      const badgeClass = workout.completed ? "done" : "planned";
      const pyramidList = Array.isArray(workout.pyramidSets)
        ? workout.pyramidSets
            .map(
              (entry, idx) =>
                `<li><span>Set ${idx + 1}</span><strong>${entry.sets}x${
                  entry.reps
                } @ ${formatWeightLabel(entry.weight)}</strong></li>`
            )
            .join("")
        : "";
      return `
        <article class="workout-card">
          <header>
            <div>
              <h3>${workout.name}</h3>
              <span>${formatDate(workout.date)}</span>
            </div>
            <span class="card-badge ${badgeClass}">${status}</span>
          </header>
          <p class="card-summary">
            ${totalSets} sets • ${totalReps} reps • ${formatWeightLabel(
        totalWeight
      )} • Volume ${formatNumber(totalVolume)}
          </p>
          ${
            pyramidList
              ? `<ul class="pyramid-list">${pyramidList}</ul>`
              : `<p class="muted-text">${summarizePyramid(workout)}</p>`
          }
          ${
            workout.notes
              ? `<p class="card-notes">Notes: ${workout.notes}</p>`
              : ""
          }
        </article>`;
    })
    .join("");

  workoutLogContainer.innerHTML = `<div class="workout-log-list">${cards}</div>`;
}

function renderCalendar() {
  if (!calendarGrid || !calendarMonthLabel) return;
  const monthStart = startOfMonth(calendarCursor);
  calendarMonthLabel.textContent = monthStart.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const firstCellDate = startOfWeek(monthStart);
  const weekdayHeaders = WEEKDAY_LABELS.map(
    (day) => `<div class="calendar-weekday">${day}</div>`
  ).join("");

  let cellsHtml = "";
  for (let i = 0; i < 42; i += 1) {
    const cellDate = new Date(firstCellDate);
    cellDate.setDate(firstCellDate.getDate() + i);
    const key = dateKey(cellDate);
    const isCurrentMonth = cellDate.getMonth() === monthStart.getMonth();
    const dayWorkouts = workouts.filter(
      (workout) => dateKey(workout.date) === key
    );

    const classes = ["calendar-cell"];
    if (!isCurrentMonth) classes.push("muted");
    if (key === selectedCalendarKey) classes.push("selected");

    const badge =
      dayWorkouts.length > 0
        ? `<span class="badge">${dayWorkouts.length}</span>`
        : "";

    cellsHtml += `
      <button type="button" class="${classes.join(" ")}" data-date="${key}">
        <span class="date-number">${cellDate.getDate()}</span>
        ${badge}
      </button>`;
  }

  calendarGrid.innerHTML = weekdayHeaders + cellsHtml;
}

function renderCalendarDetails() {
  if (!calendarSelectedDateLabel || !calendarWorkoutList) return;
  if (!selectedCalendarKey) {
    calendarSelectedDateLabel.textContent = "Select a day";
    calendarWorkoutList.innerHTML =
      "<li class='muted-text'>No date selected.</li>";
    return;
  }

  calendarSelectedDateLabel.textContent = formatDate(selectedCalendarKey);
  const dayWorkouts = workouts
    .filter((workout) => dateKey(workout.date) === selectedCalendarKey)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!dayWorkouts.length) {
    calendarWorkoutList.innerHTML =
      "<li class='muted-text'>No workouts scheduled.</li>";
    return;
  }

  calendarWorkoutList.innerHTML = dayWorkouts
    .map((workout) => {
      const totalSets = getTotalSets(workout);
      const totalReps = getTotalReps(workout);
      const totalWeight = getTotalWeight(workout);
      const setList =
        Array.isArray(workout.pyramidSets) && workout.pyramidSets.length
          ? `<ul class="calendar-set-list">
              ${workout.pyramidSets
                .map(
                  (entry, idx) =>
                    `<li>Set ${idx + 1}: <strong>${entry.sets}x${
                      entry.reps
                    }</strong> @ ${formatWeightLabel(entry.weight)}</li>`
                )
                .join("")}
            </ul>`
          : "<p class=\"calendar-item-note\">No set details logged.</p>";
      const noteBlock = workout.notes
        ? `<p class="calendar-item-note">Notes: ${workout.notes}</p>`
        : "";
      return `
        <li class="calendar-item">
          <p class="calendar-item-title">${workout.name}</p>
          <p class="calendar-item-summary">${totalSets} sets x ${totalReps} reps • ${formatWeightLabel(
            totalWeight
          )}</p>
          ${setList}
          ${noteBlock}
        </li>`;
    })
    .join("");
}

function handleCalendarClick(event) {
  const cell = event.target.closest(".calendar-cell");
  if (!cell) return;
  const { date } = cell.dataset;
  if (!date) return;
  selectedCalendarKey = date;
  const selectedDate = parseLocalDate(date);
  if (selectedDate) {
    calendarCursor = startOfMonth(selectedDate);
    if (form.elements.date) {
      form.elements.date.value = date;
    }
  }
  renderCalendar();
  renderCalendarDetails();
}

function shiftCalendarMonth(offset) {
  const newDate = new Date(calendarCursor);
  newDate.setMonth(calendarCursor.getMonth() + offset);
  calendarCursor = startOfMonth(newDate);
  renderCalendar();
  renderCalendarDetails();
}

function initChart() {
  statsChart = new Chart(statsCanvas, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Sets",
          backgroundColor: "rgba(93, 224, 163, 0.7)",
          borderRadius: 6,
          data: [],
        },
        {
          label: "Reps",
          backgroundColor: "rgba(114, 181, 255, 0.6)",
          borderRadius: 6,
          data: [],
        },
        {
          label: "Weight (kg)",
          type: "line",
          borderColor: "#f9c74f",
          backgroundColor: "rgba(249, 199, 79, 0.25)",
          borderWidth: 2,
          tension: 0.35,
          yAxisID: "y1",
          data: [],
        },
        {
          label: "Volume (kg·reps)",
          type: "line",
          borderColor: "#ff8fab",
          backgroundColor: "rgba(255, 143, 171, 0.25)",
          borderWidth: 2,
          tension: 0.35,
          yAxisID: "y1",
          data: [],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#f7f9fc" },
        },
      },
      scales: {
        x: {
          ticks: { color: "#8c96a9" },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          ticks: { color: "#8c96a9" },
          grid: { color: "rgba(255,255,255,0.05)" },
          beginAtZero: true,
        },
        y1: {
          position: "right",
          ticks: { color: "#f9c74f" },
          grid: { drawOnChartArea: false },
          beginAtZero: true,
        },
      },
    },
  });
}

function updateStats() {
  const stats = buildStats(activeRange);

  statsChart.data.labels = stats.labels;
  statsChart.data.datasets[0].data = stats.setsData;
  statsChart.data.datasets[1].data = stats.repsData;
  statsChart.data.datasets[2].data = stats.weightData;
  statsChart.data.datasets[3].data = stats.volumeData;
  statsChart.update();

  statNumbers.innerHTML = `
    <div class="stat-box">
      <span>Workouts</span>
      <strong>${stats.totals.workouts}</strong>
    </div>
    <div class="stat-box">
      <span>Total Sets</span>
      <strong>${stats.totals.sets}</strong>
    </div>
    <div class="stat-box">
      <span>Total Reps</span>
      <strong>${stats.totals.reps}</strong>
    </div>
    <div class="stat-box">
      <span>Total Weight</span>
      <strong>${formatWeightLabel(stats.totals.weight)}</strong>
    </div>
    <div class="stat-box">
      <span>Total Volume</span>
      <strong>${formatNumber(stats.totals.volume)}</strong>
    </div>
  `;
}

function buildStats(range) {
  const today = startOfDay(new Date());
  let labels = [];
  let setsData = [];
  let repsData = [];
  let weightData = [];
  let volumeData = [];

  const buckets = [];
  if (range === "daily") {
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const key = dateKey(day);
      buckets.push({ key, label: day.toLocaleDateString(undefined, { weekday: "short" }) });
    }
  } else if (range === "weekly") {
    for (let i = 5; i >= 0; i--) {
      const weekStart = startOfWeek(new Date(today));
      weekStart.setDate(weekStart.getDate() - i * 7);
      const key = dateKey(weekStart);
      const label = `${weekStart.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })}`;
      buckets.push({ key, label });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const month = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${month.getFullYear()}-${month.getMonth()}`;
      const label = month.toLocaleDateString(undefined, { month: "short" });
      buckets.push({ key, label });
    }
  }

  const totals = { workouts: 0, sets: 0, reps: 0, weight: 0, volume: 0 };

  buckets.forEach((bucket) => {
    let bucketSets = 0;
    let bucketReps = 0;
    let bucketWeight = 0;
    let bucketVolume = 0;
    let bucketWorkouts = 0;

    workouts.forEach((workout) => {
      const wDate = parseLocalDate(workout.date);
      if (!isWithinRange(range, today, wDate)) return;
      if (
        statsWorkoutFilter !== "all" &&
        workout.name !== statsWorkoutFilter
      ) {
        return;
      }

      let matches = false;
      if (range === "daily") {
        matches = dateKey(wDate) === bucket.key;
      } else if (range === "weekly") {
        matches = dateKey(startOfWeek(wDate)) === bucket.key;
      } else {
        matches =
          `${wDate.getFullYear()}-${wDate.getMonth()}` === bucket.key;
      }

      if (matches) {
        bucketSets += getTotalSets(workout);
        bucketReps += getTotalReps(workout);
        bucketWeight += getTotalWeight(workout);
        bucketVolume += getTotalVolume(workout);
        bucketWorkouts += 1;
      }
    });

    setsData.push(bucketSets);
    repsData.push(bucketReps);
    weightData.push(bucketWeight);
    volumeData.push(bucketVolume);
    totals.sets += bucketSets;
    totals.reps += bucketReps;
    totals.weight += bucketWeight;
    totals.volume += bucketVolume;
    totals.workouts += bucketWorkouts;
  });

  labels = buckets.map((b) => b.label);
  return { labels, setsData, repsData, weightData, volumeData, totals };
}

function isWithinRange(range, today, date) {
  const start = new Date(today);
  if (range === "daily") {
    start.setDate(today.getDate() - 6);
  } else if (range === "weekly") {
    start.setDate(today.getDate() - 5 * 7);
  } else {
    start.setMonth(today.getMonth() - 5);
  }
  return date >= start && date <= today;
}

function loadWorkouts() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveWorkouts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
}

function persistAndRender() {
  saveWorkouts();
//   renderSummary();
  renderReminders();
  populateWorkoutFilter();
  updateStats();
  renderWorkoutLog();
  renderCalendar();
  renderCalendarDetails();
}

function showFormMessage(message, isError = false) {
  formFeedback.textContent = message;
  formFeedback.classList.toggle("error", isError);
}

function getScheduleLabel(workout) {
  if (workout.completed) {
    return { text: "Completed", className: "completed" };
  }

  const workoutDate = startOfDay(parseLocalDate(workout.date));
  const today = startOfDay(new Date());

  if (dateKey(workoutDate) === dateKey(today)) {
    return { text: "Today", className: "today" };
  }

  if (workoutDate > today) {
    return { text: "Upcoming", className: "upcoming" };
  }

  return { text: "Past", className: "past" };
}

function formatDate(dateStr) {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isUpcoming(dateStr) {
  const date = parseLocalDate(dateStr);
  const today = startOfDay(new Date());
  return date >= today;
}

function dateKey(date) {
  const d =
    date instanceof Date
      ? new Date(date)
      : parseLocalDate(typeof date === "string" ? date : "");
  if (!d || Number.isNaN(d)) return "";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((val) => Number.isNaN(val))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function validateForm({ name, selectedDate, mediaUrl, reminderOffset }) {
  const errors = {};

  if (!name) {
    errors.name = "Workout name is required.";
  } else if (name.length < 3) {
    errors.name = "Name must be at least 3 characters.";
  }

  if (!selectedDate) {
    errors.date = "Pick a workout date.";
  }

  if (mediaUrl) {
    try {
      new URL(mediaUrl);
    } catch {
      errors.mediaUrl = "Enter a valid URL (include https://).";
    }
  }

  if (
    Number.isNaN(reminderOffset) ||
    reminderOffset < 0 ||
    reminderOffset > 3
  ) {
    errors.reminderOffset = "Choose a reminder offset between 0-3 days.";
  }

  return errors;
}

function clearFieldErrors() {
  Object.values(fieldErrorMap).forEach((el) => {
    el.textContent = "";
  });
  Array.from(form.elements).forEach((element) =>
    element.classList && element.classList.remove("invalid")
  );
  pyramidRows.forEach((row) => {
    row.querySelectorAll("input").forEach((input) => {
      input.classList.remove("invalid");
    });
  });
}

function setFieldError(fieldName, message) {
  const field = form.elements[fieldName];
  if (field && field.classList) {
    field.classList.add("invalid");
  }
  const errorEl = fieldErrorMap[fieldName];
  if (errorEl) {
    errorEl.textContent = message;
  }
}

function describeReminder(offset = 0) {
  if (!offset) return "Reminder on workout day";
  if (offset === 1) return "Reminder 1 day before";
  return `Reminder ${offset} days before`;
}

function reminderDateText(dateStr, offset = 0) {
  const reminder = reminderDate(dateStr, offset);
  if (!reminder) return "";
  return reminder.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function reminderDate(dateStr, offset = 0) {
  const workoutDate = parseLocalDate(dateStr);
  if (!workoutDate) return null;
  const reminder = new Date(workoutDate);
  reminder.setDate(reminder.getDate() - (offset || 0));
  return reminder;
}

function readPyramidInputs() {
  return pyramidRows.map((row, index) => {
    const setsInput = row.querySelector("input[data-field='sets']");
    const repsInput = row.querySelector("input[data-field='reps']");
    const weightInput = row.querySelector("input[data-field='weight']");
    return {
      index,
      setsInput,
      repsInput,
      weightInput,
      sets: toNullableNumber(setsInput.value),
      reps: toNullableNumber(repsInput.value),
      weight: toNullableNumber(weightInput.value),
    };
  });
}

function validatePyramid(rows) {
  const entries = [];
  const errors = [];

  rows.forEach((row) => {
    const hasSets = row.sets !== null;
    const hasReps = row.reps !== null;
    const hasWeight = row.weight !== null;

    const markInvalid = () => {
      row.setsInput.classList.add("invalid");
      row.repsInput.classList.add("invalid");
      row.weightInput.classList.add("invalid");
    };

    const clearInvalid = () => {
      row.setsInput.classList.remove("invalid");
      row.repsInput.classList.remove("invalid");
      row.weightInput.classList.remove("invalid");
    };

    if (!hasSets && !hasReps && !hasWeight) {
      row.setsInput.classList.remove("invalid");
      row.repsInput.classList.remove("invalid");
      row.weightInput.classList.remove("invalid");
      return;
    }

    if (!hasSets || !hasReps || !hasWeight) {
      errors[0] =
        errors[0] ?? "Complete sets, reps, and weight for each row used.";
      markInvalid();
      return;
    }

    if (
      !Number.isInteger(row.sets) ||
      row.sets < 1 ||
      row.sets > 20 ||
      !Number.isInteger(row.reps) ||
      row.reps < 1 ||
      row.reps > 100
    ) {
      errors[0] = errors[0] ?? "Sets must be 1-20 and reps 1-100.";
      markInvalid();
      return;
    }

    if (
      Number.isNaN(row.weight) ||
      row.weight < 0 ||
      row.weight > 500
    ) {
      errors[0] = errors[0] ?? "Weight must be between 0 and 500 kg.";
      markInvalid();
      return;
    }

    clearInvalid();
    entries.push({ sets: row.sets, reps: row.reps, weight: row.weight });
  });

  if (!entries.length) {
    errors[0] = errors[0] ?? "Enter at least one pyramid set with weight.";
    if (rows[0]) {
      rows[0].setsInput.classList.add("invalid");
      rows[0].repsInput.classList.add("invalid");
      rows[0].weightInput.classList.add("invalid");
    }
  }

  const totals = entries.reduce(
    (acc, entry) => {
      acc.totalSets += entry.sets;
      acc.totalReps += entry.reps;
      acc.totalWeight += entry.weight;
      acc.totalVolume += entry.weight * entry.reps;
      return acc;
    },
    { totalSets: 0, totalReps: 0, totalWeight: 0, totalVolume: 0 }
  );

  return { entries, errors, ...totals };
}

function fillPyramidRows(workout) {
  const safeSets =
    workout && Array.isArray(workout.pyramidSets) && workout.pyramidSets.length
      ? workout.pyramidSets
      : workout && typeof workout.sets === "number" && typeof workout.reps === "number"
      ? [
          {
            sets: workout.sets,
            reps: workout.reps,
            weight:
              typeof workout.totalWeight === "number"
                ? workout.totalWeight
                : 0,
          },
        ]
      : [];

  pyramidRows.forEach((row, index) => {
    const setsInput = row.querySelector("input[data-field='sets']");
    const repsInput = row.querySelector("input[data-field='reps']");
    const weightInput = row.querySelector("input[data-field='weight']");
    const entry = safeSets[index] || {};
    setsInput.value = entry.sets ?? "";
    repsInput.value = entry.reps ?? "";
    weightInput.value =
      typeof entry.weight !== "undefined" && entry.weight !== null
        ? entry.weight
        : "";
  });
}

function summarizePyramid(workout) {
  if (Array.isArray(workout.pyramidSets) && workout.pyramidSets.length) {
    return workout.pyramidSets
      .map(
        (entry, index) =>
          `S${index + 1}:${entry.sets}x${entry.reps}@${formatWeightLabel(
            entry.weight
          )}`
      )
      .join(" • ");
  }
  if (
    typeof workout.totalSets === "number" &&
    typeof workout.totalReps === "number"
  ) {
    return `${workout.totalSets}x${workout.totalReps}`;
  }
  if (typeof workout.sets === "number" && typeof workout.reps === "number") {
    return `${workout.sets}x${workout.reps}`;
  }
  return "-";
}

function getTotalSets(workout) {
  if (Array.isArray(workout.pyramidSets) && workout.pyramidSets.length) {
    return workout.pyramidSets.reduce(
      (sum, entry) => sum + (Number(entry.sets) || 0),
      0
    );
  }
  if (typeof workout.totalSets === "number") return workout.totalSets;
  if (typeof workout.sets === "number") return workout.sets;
  return 0;
}

function getTotalReps(workout) {
  if (Array.isArray(workout.pyramidSets) && workout.pyramidSets.length) {
    return workout.pyramidSets.reduce(
      (sum, entry) => sum + (Number(entry.reps) || 0),
      0
    );
  }
  if (typeof workout.totalReps === "number") return workout.totalReps;
  if (typeof workout.reps === "number") return workout.reps;
  return 0;
}

function toNullableNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function getTotalWeight(workout) {
  if (Array.isArray(workout.pyramidSets) && workout.pyramidSets.length) {
    return workout.pyramidSets.reduce(
      (sum, entry) => sum + (Number(entry.weight) || 0),
      0
    );
  }
  if (typeof workout.totalWeight === "number") return workout.totalWeight;
  const fallback =
    typeof workout.weight === "number" ? workout.weight : workout.mediaWeight;
  return fallback ?? 0;
}

function getTotalVolume(workout) {
  if (Array.isArray(workout.pyramidSets) && workout.pyramidSets.length) {
    return workout.pyramidSets.reduce(
      (sum, entry) => sum + (Number(entry.weight || 0) * (Number(entry.reps) || 0)),
      0
    );
  }
  if (typeof workout.totalVolume === "number") return workout.totalVolume;
  const weight = getTotalWeight(workout);
  const reps = getTotalReps(workout);
  return weight * reps;
}

function formatWeightLabel(value) {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return "Bodyweight";
  }
  return `${parseFloat(value.toFixed(1))} kg`;
}

function formatNumber(value) {
  if (typeof value !== "number") return "0";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}

function populateWorkoutFilter() {
  if (!workoutFilterSelect) return;
  const uniqueNames = Array.from(new Set(workouts.map((w) => w.name))).sort(
    (a, b) => a.localeCompare(b)
  );
  const options = ["all", ...uniqueNames]
    .map(
      (name) =>
        `<option value="${name === "all" ? "all" : name}">${
          name === "all" ? "All workouts" : name
        }</option>`
    )
    .join("");
  workoutFilterSelect.innerHTML = options;
  if (
    statsWorkoutFilter !== "all" &&
    !uniqueNames.includes(statsWorkoutFilter)
  ) {
    statsWorkoutFilter = "all";
  }
  workoutFilterSelect.value = statsWorkoutFilter;
}

function handleWorkoutFilterChange(event) {
  statsWorkoutFilter = event.target.value;
  updateStats();
}

function handleMediaFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    clearMediaUpload();
    return;
  }

  const isVideo = file.type.startsWith("video");
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    showFormMessage("File too large. Please select a file under 10MB.", true);
    clearMediaUpload(true);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    mediaUploadData = {
      mode: "upload",
      type: isVideo ? "video" : "image",
      url: reader.result,
      name: file.name,
    };
    mediaTypeSelect.value = mediaUploadData.type;
    mediaUrlInput.value = "";
    updateMediaPreview();
    showFormMessage("Media file attached.");
  };
  reader.readAsDataURL(file);
}

function clearMediaUpload(resetSelector) {
  mediaUploadData = null;
  if (mediaFileInput && resetSelector) {
    mediaFileInput.value = "";
  }
  if (resetSelector) {
    mediaUrlInput.value = "";
  }
  updateMediaPreview();
}

function buildMediaSource(url, type) {
  if (mediaUploadData?.url) {
    return { ...mediaUploadData };
  }
  if (url) {
    return { mode: "url", url, type };
  }
  return null;
}

function resolveMedia(workout) {
  if (workout.mediaSource) return workout.mediaSource;
  if (workout.mediaUrl) {
    return {
      mode: "url",
      type: workout.mediaType || "image",
      url: workout.mediaUrl,
    };
  }
  return null;
}

