const STORAGE_KEY = "pet-pantry-state-v1";
const DESIGN_KEY = "pet-pantry-design-v1";
const PROFILE_KEY = "pet-pantry-profile-v1";
const MAX_STOCK = 4;
const MAX_AGE = 4;

const itemMeta = {
  food: { label: "사료", preset: 24, line: "사료 봉투가 다시 꽉 찼어요" },
  can: { label: "캔", preset: 12, line: "캔이 선반에 쌓였어요" },
  treat: { label: "간식", preset: 9, line: "간식 봉지가 채워졌어요" },
  pad: { label: "패드", preset: 6, line: "패드 묶음이 들어왔어요" },
  litter: { label: "모래", preset: 3, line: "모래 포대가 채워졌어요" },
};

const defaultState = {
  selected: "food",
  items: {
    food: { units: [] },
    can: { units: [] },
    treat: { units: [] },
    pad: { units: [] },
    litter: { units: [] },
  },
};

const buttons = document.querySelectorAll(".item-button");
const appShell = document.querySelector(".app-shell");
const appTitle = document.querySelector("h1");
const kicker = document.querySelector(".brand-kicker");
const shopStage = document.querySelector(".shop-stage");
const passDayButton = document.querySelector("#pass-day-button");
const resetButton = document.querySelector("#reset-button");
const fillLowButton = document.querySelector("#fill-low-button");
const editorToggle = document.querySelector("#editor-toggle");
const editorPanel = document.querySelector("#editor-panel");
const editorClose = document.querySelector("#editor-close");
const editorReset = document.querySelector("#editor-reset");
const onboarding = document.querySelector("#onboarding");
const onboardingForm = document.querySelector("#onboarding-form");
const petNameInput = document.querySelector("#pet-name-input");

const defaultDesign = {
  text: {
    appTitle: "",
    kicker: "PET PANTRY",
  },
  positions: {
    food: { x: 9, y: 14 },
    can: { x: 9, y: 29 },
    treat: { x: 9, y: 44 },
    pad: { x: 9, y: 59 },
    litter: { x: 9, y: 74 },
  },
};

const defaultProfile = {
  petName: "",
};

let state = loadState();
let design = loadDesign();
let profile = loadProfile();
let activeDrag = null;

applyDesign();
hydrateEditor();
render();
showOnboardingIfNeeded();

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.item;
    restock(key);
  });
});

passDayButton.addEventListener("click", () => {
  Object.keys(state.items).forEach((key) => {
    state.items[key].units = state.items[key].units.map((unit) => ({
      ...unit,
      age: Math.min(MAX_AGE, unit.age + 1),
    }));
  });

  const lowest = getLowestItem();
  state.selected = lowest;
  saveState();
  render();
});

resetButton.addEventListener("click", () => {
  state = structuredClone(defaultState);
  saveState();
  render();
});

fillLowButton.addEventListener("click", () => {
  restock(getLowestItem());
});

editorToggle.addEventListener("click", () => {
  editorPanel.hidden = !editorPanel.hidden;
  appShell.classList.toggle("is-editing", !editorPanel.hidden);
});

editorClose.addEventListener("click", () => {
  editorPanel.hidden = true;
  appShell.classList.remove("is-editing");
});

editorReset.addEventListener("click", () => {
  design = structuredClone(defaultDesign);
  profile = structuredClone(defaultProfile);
  saveDesign();
  saveProfile();
  applyDesign();
  hydrateEditor();
  render();
  showOnboardingIfNeeded();
});

onboardingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = petNameInput.value.trim() || "두부";
  profile.petName = name;
  design.text.appTitle = `${name}의 펫창고`;
  saveProfile();
  saveDesign();
  applyDesign();
  hydrateEditor();
  onboarding.hidden = true;
});

document.querySelectorAll("[data-edit-text]").forEach((input) => {
  input.addEventListener("input", () => {
    const key = input.dataset.editText;
    design.text[key] = input.value;
    saveDesign();
    applyDesign();
    render();
  });
});

document.querySelectorAll("[data-edit-position]").forEach((input) => {
  input.addEventListener("input", () => {
    const key = input.dataset.editPosition;
    design.positions[key].y = Number(input.value);
    saveDesign();
    applyDesign();
    hydrateEditor();
  });
});

document.querySelectorAll(".stock-group").forEach((group) => {
  group.addEventListener("pointerdown", (event) => {
    if (!appShell.classList.contains("is-editing")) return;
    const key = group.dataset.slot;
    const stageBox = shopStage.getBoundingClientRect();
    const groupBox = group.getBoundingClientRect();
    activeDrag = {
      key,
      pointerId: event.pointerId,
      offsetX: event.clientX - groupBox.left,
      offsetY: event.clientY - groupBox.top,
      stageBox,
    };
    group.classList.add("dragging");
    group.setPointerCapture(event.pointerId);
    state.selected = key;
    render();
  });

  group.addEventListener("pointermove", (event) => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const { key, offsetX, offsetY, stageBox } = activeDrag;
    const x = ((event.clientX - stageBox.left - offsetX) / stageBox.width) * 100;
    const y = ((event.clientY - stageBox.top - offsetY) / stageBox.height) * 100;
    design.positions[key].x = clamp(Math.round(x), 0, 78);
    design.positions[key].y = clamp(Math.round(y), 0, 86);
    saveDesign();
    applyDesign();
    hydrateEditor();
  });

  group.addEventListener("pointerup", endDrag);
  group.addEventListener("pointercancel", endDrag);
});

function restock(key) {
  const meta = itemMeta[key];
  if (!meta) return;

  state.selected = key;
  if (state.items[key].units.length < MAX_STOCK) {
    state.items[key].units.push({ id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, age: 0 });
  }
  saveState();
  render(true);
}

function render(popSelected = false) {
  buttons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.item === state.selected);
  });

  Object.entries(state.items).forEach(([key, item]) => {
    const group = document.querySelector(`[data-slot="${key}"]`);
    const status = getStatus(item.units);

    group.classList.toggle("selected", key === state.selected);
    group.classList.toggle("low", status === "low");
    group.classList.toggle("empty", status === "empty");

    group.innerHTML = "";
    item.units.forEach((storedUnit, i) => {
      const unit = document.createElement("span");
      unit.className = `supply-unit ${key} age-${storedUnit.age}`;
      unit.title = storedUnit.age >= MAX_AGE ? "다 쓴 물건 치우기" : `${storedUnit.age}주 사용`;
      unit.addEventListener("click", (event) => {
        if (appShell.classList.contains("is-editing") || storedUnit.age < MAX_AGE) return;
        event.stopPropagation();
        state.items[key].units = state.items[key].units.filter((candidate) => candidate.id !== storedUnit.id);
        state.selected = key;
        saveState();
        render();
      });
      if (popSelected && key === state.selected) {
        unit.style.animationDelay = `${i * 35}ms`;
      }
      group.append(unit);
    });

  });

  fillLowButton.title = `${itemMeta[getLowestItem()].label} 채우기`;
}

function getStatus(units) {
  if (units.length <= 0) return "empty";
  if (units.some((unit) => unit.age >= MAX_AGE)) return "low";
  if (units.length <= 1) return "low";
  if (units.length <= 2) return "half";
  return "full";
}

function getLowestItem() {
  return Object.keys(state.items).sort((a, b) => {
    const aUnits = state.items[a].units;
    const bUnits = state.items[b].units;
    if (aUnits.length !== bUnits.length) {
      return aUnits.length - bUnits.length;
    }
    return getAverageAge(bUnits) - getAverageAge(aUnits);
  })[0];
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.items) return normalizeState(saved);
  } catch {
    // Ignore malformed local state and start fresh.
  }
  return structuredClone(defaultState);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applyDesign() {
  appTitle.textContent = design.text.appTitle || getDefaultTitle();
  kicker.textContent = design.text.kicker;
  passDayButton.textContent = "↻";
  fillLowButton.textContent = "＋";
  resetButton.textContent = "↺";

  Object.entries(design.positions).forEach(([key, value]) => {
    appShell.style.setProperty(`--${key}-left`, `${value.x}%`);
    appShell.style.setProperty(`--${key}-top`, `${value.y}%`);
  });
}

function hydrateEditor() {
  document.querySelectorAll("[data-edit-text]").forEach((input) => {
    input.value = design.text[input.dataset.editText] ?? "";
  });
  document.querySelectorAll("[data-edit-position]").forEach((input) => {
    input.value = design.positions[input.dataset.editPosition]?.y ?? 0;
  });
  document.querySelectorAll("[data-coord]").forEach((input) => {
    const pos = design.positions[input.dataset.coord];
    input.value = pos ? `${pos.x}, ${pos.y}` : "";
  });
}

function loadDesign() {
  try {
    const saved = JSON.parse(localStorage.getItem(DESIGN_KEY));
    if (saved?.text && saved?.positions) {
      return {
        text: { ...defaultDesign.text, ...saved.text },
        positions: normalizePositions(saved.positions),
      };
    }
  } catch {
    // Ignore malformed design state and start fresh.
  }
  return structuredClone(defaultDesign);
}

function saveDesign() {
  localStorage.setItem(DESIGN_KEY, JSON.stringify(design));
}

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (saved) return { ...defaultProfile, ...saved };
  } catch {
    // Ignore malformed profile state and start fresh.
  }
  return structuredClone(defaultProfile);
}

function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function showOnboardingIfNeeded() {
  if (profile.petName) {
    onboarding.hidden = true;
    return;
  }
  petNameInput.value = "";
  onboarding.hidden = false;
  setTimeout(() => petNameInput.focus(), 50);
}

function getDefaultTitle() {
  return profile.petName ? `${profile.petName}의 펫창고` : "펫창고";
}

function endDrag(event) {
  if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
  document.querySelector(`[data-slot="${activeDrag.key}"]`)?.classList.remove("dragging");
  activeDrag = null;
}

function normalizePositions(savedPositions = {}) {
  return Object.fromEntries(Object.entries(defaultDesign.positions).map(([key, fallback]) => {
    const saved = savedPositions[key];
    if (typeof saved === "number") {
      return [key, { x: fallback.x, y: saved }];
    }
    return [key, { ...fallback, ...(saved ?? {}) }];
  }));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeState(saved) {
  const next = structuredClone(defaultState);
  next.selected = saved.selected && next.items[saved.selected] ? saved.selected : next.selected;

  Object.keys(next.items).forEach((key) => {
    const item = saved.items?.[key];
    if (Array.isArray(item?.units)) {
      next.items[key].units = item.units.slice(0, MAX_STOCK).map((unit, index) => ({
        id: unit.id ?? `${key}-${index}-${Date.now()}`,
        age: clamp(Number(unit.age) || 0, 0, MAX_AGE),
      }));
      return;
    }

    const legacyStock = clamp(Number(item?.stock) || 0, 0, MAX_STOCK);
    next.items[key].units = Array.from({ length: legacyStock }, (_, index) => ({
      id: `${key}-legacy-${index}-${Date.now()}`,
      age: 0,
    }));
  });

  return next;
}

function getAverageAge(units) {
  if (units.length === 0) return MAX_AGE + 1;
  return units.reduce((sum, unit) => sum + unit.age, 0) / units.length;
}
