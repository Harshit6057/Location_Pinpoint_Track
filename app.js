const ADMIN_PASSWORD = "admin123";
const REFRESH_INTERVAL_MS = 10000;

const appState = {
  currentMember: null,
  adminUnlocked: false,
  livePosition: null,
  liveMarker: null,
  watchId: null,
  members: [],
  memberPoints: [],
  adminPoints: [],
  maps: {
    member: null,
    admin: null,
  },
  layers: {
    member: null,
    admin: null,
  },
};

const nodes = {
  memberTab: document.getElementById("memberTab"),
  adminTab: document.getElementById("adminTab"),
  memberPanel: document.getElementById("memberPanel"),
  adminPanel: document.getElementById("adminPanel"),
  memberLoginForm: document.getElementById("memberLoginForm"),
  memberName: document.getElementById("memberName"),
  memberStatus: document.getElementById("memberStatus"),
  liveLocationText: document.getElementById("liveLocationText"),
  pinLiveLocationBtn: document.getElementById("pinLiveLocationBtn"),
  memberDateMode: document.getElementById("memberDateMode"),
  memberDateInput: document.getElementById("memberDateInput"),
  memberLocations: document.getElementById("memberLocations"),
  adminLoginForm: document.getElementById("adminLoginForm"),
  adminPassword: document.getElementById("adminPassword"),
  adminStatus: document.getElementById("adminStatus"),
  adminContent: document.getElementById("adminContent"),
  memberFilter: document.getElementById("memberFilter"),
  adminDateMode: document.getElementById("adminDateMode"),
  adminDateInput: document.getElementById("adminDateInput"),
  memberList: document.getElementById("memberList"),
  adminLocations: document.getElementById("adminLocations"),
};

setupTabs();
setupMemberMap();
setupAdminMap();
setupMemberLogin();
setupAdminLogin();
setupFilter();
setupPinLiveLocation();
setupDateFilters();
updateDateInputState();
bootstrap();

async function bootstrap() {
  await refreshMembers();
  await Promise.all([refreshMemberPoints(), refreshAdminPoints()]);
  renderMemberSection();
  renderAdminSection();

  setInterval(async () => {
    await refreshMembers();
    await Promise.all([refreshMemberPoints(), refreshAdminPoints()]);
    renderMemberSection();
    renderAdminSection();
  }, REFRESH_INTERVAL_MS);
}

function setupTabs() {
  nodes.memberTab.addEventListener("click", () => showPanel("member"));
  nodes.adminTab.addEventListener("click", () => showPanel("admin"));
}

function showPanel(panelName) {
  const showMember = panelName === "member";
  nodes.memberTab.classList.toggle("active", showMember);
  nodes.adminTab.classList.toggle("active", !showMember);
  nodes.memberPanel.classList.toggle("visible", showMember);
  nodes.adminPanel.classList.toggle("visible", !showMember);

  if (showMember) {
    setTimeout(() => appState.maps.member.invalidateSize(), 100);
  } else {
    setTimeout(() => appState.maps.admin.invalidateSize(), 100);
  }
}

function setupMemberMap() {
  appState.maps.member = L.map("memberMap").setView([20.5937, 78.9629], 5);
  appState.layers.member = L.layerGroup().addTo(appState.maps.member);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(appState.maps.member);
}

function setupAdminMap() {
  appState.maps.admin = L.map("adminMap").setView([20.5937, 78.9629], 5);
  appState.layers.admin = L.layerGroup().addTo(appState.maps.admin);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(appState.maps.admin);
}

function setupMemberLogin() {
  nodes.memberLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = normalizeName(nodes.memberName.value);
    if (!name) {
      nodes.memberStatus.textContent = "Enter a valid name.";
      return;
    }

    try {
      await apiMemberLogin(name);
      appState.currentMember = name;
      await refreshMembers();
      await refreshMemberPoints();
      await refreshAdminPoints();
    } catch {
      nodes.memberStatus.textContent = "Unable to login right now. Please try again.";
      return;
    }

    nodes.memberName.value = "";
    nodes.memberStatus.textContent = `Logged in as ${name}. Allow location access to sync live position.`;
    requestLiveLocationAccess();
    renderMemberSection();
    renderAdminSection();
  });
}

function setupAdminLogin() {
  nodes.adminLoginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const password = nodes.adminPassword.value;

    if (password !== ADMIN_PASSWORD) {
      appState.adminUnlocked = false;
      nodes.adminStatus.textContent = "Wrong password.";
      nodes.adminContent.classList.add("hidden");
      return;
    }

    appState.adminUnlocked = true;
    nodes.adminStatus.textContent = "Admin unlocked.";
    nodes.adminContent.classList.remove("hidden");
    nodes.adminPassword.value = "";
    renderAdminSection();
    setTimeout(() => appState.maps.admin.invalidateSize(), 100);
  });
}

function setupFilter() {
  nodes.memberFilter.addEventListener("change", () => {
    if (!appState.adminUnlocked) {
      return;
    }
    renderAdminSection();
  });
}

function setupPinLiveLocation() {
  nodes.pinLiveLocationBtn.addEventListener("click", async () => {
    if (!appState.currentMember) {
      nodes.memberStatus.textContent = "Login first to pin your live location.";
      return;
    }

    if (!appState.livePosition) {
      nodes.memberStatus.textContent = "Live location not ready yet. Please allow location access.";
      return;
    }

    const point = {
      id: crypto.randomUUID(),
      memberName: appState.currentMember,
      lat: Number(appState.livePosition.lat.toFixed(6)),
      lng: Number(appState.livePosition.lng.toFixed(6)),
      createdAt: new Date().toISOString(),
    };

    try {
      await apiCreatePoint(point);
      await refreshMembers();
      await refreshMemberPoints();
      await refreshAdminPoints();
      nodes.memberStatus.textContent = "Live location pinned successfully.";
    } catch {
      nodes.memberStatus.textContent = "Could not save point. Please retry.";
      return;
    }

    renderMemberSection();
    renderAdminSection();
  });
}

function setupDateFilters() {
  nodes.memberDateMode.addEventListener("change", async () => {
    updateDateInputState();
    await refreshMemberPoints();
    renderMemberSection();
  });
  nodes.memberDateInput.addEventListener("change", async () => {
    await refreshMemberPoints();
    renderMemberSection();
  });
  nodes.adminDateMode.addEventListener("change", async () => {
    updateDateInputState();
    if (!appState.adminUnlocked) {
      return;
    }
    await refreshAdminPoints();
    renderAdminSection();
  });
  nodes.adminDateInput.addEventListener("change", async () => {
    if (!appState.adminUnlocked) {
      return;
    }
    await refreshAdminPoints();
    renderAdminSection();
  });
}

function updateDateInputState() {
  nodes.memberDateInput.disabled = nodes.memberDateMode.value !== "DATE";
  nodes.adminDateInput.disabled = nodes.adminDateMode.value !== "DATE";
}

function requestLiveLocationAccess() {
  if (!navigator.geolocation) {
    nodes.memberStatus.textContent = "Geolocation not supported in this browser.";
    return;
  }

  if (appState.watchId !== null) {
    navigator.geolocation.clearWatch(appState.watchId);
    appState.watchId = null;
  }

  appState.watchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      appState.livePosition = { lat, lng };

      nodes.liveLocationText.textContent = `Live: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      nodes.memberStatus.textContent = `Live location synced for ${appState.currentMember}.`;

      if (!appState.liveMarker) {
        appState.liveMarker = L.circleMarker([lat, lng], {
          radius: 9,
          color: "#0d7a69",
          fillColor: "#0d7a69",
          fillOpacity: 0.35,
          weight: 2,
        }).bindPopup("Your live location");
        appState.liveMarker.addTo(appState.maps.member);
      } else {
        appState.liveMarker.setLatLng([lat, lng]);
      }

      appState.maps.member.setView([lat, lng], 16);
    },
    (error) => {
      nodes.memberStatus.textContent = `Location access error: ${error.message}`;
      nodes.liveLocationText.textContent = "Live location not available";
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 2000,
    }
  );
}

function renderMemberSection() {
  appState.layers.member.clearLayers();

  if (!appState.currentMember) {
    renderList(nodes.memberLocations, []);
    return;
  }

  const points = appState.memberPoints;

  for (const point of points) {
    const marker = L.marker([point.lat, point.lng]).bindPopup(
      `<strong>${escapeHtml(point.memberName)}</strong><br>${point.lat}, ${point.lng}`
    );
    marker.addTo(appState.layers.member);
  }

  if (points.length) {
    const latest = points[points.length - 1];
    appState.maps.member.setView([latest.lat, latest.lng], 12);
  }

  renderList(
    nodes.memberLocations,
    points.map((point, index) => {
      const dateText = new Date(point.createdAt).toLocaleString();
      return `${index + 1}. ${point.lat}, ${point.lng} (${dateText})`;
    })
  );
}

function renderAdminSection() {
  const selected = nodes.memberFilter.value || "ALL";
  const members = [...appState.members];

  rebuildMemberFilter(members, selected);
  const filteredPoints = appState.adminPoints;

  renderList(nodes.memberList, members.map((name) => `${name}`));

  if (!appState.adminUnlocked) {
    return;
  }

  appState.layers.admin.clearLayers();
  for (const point of filteredPoints) {
    const marker = L.circleMarker([point.lat, point.lng], {
      radius: 7,
      color: "#0d7a69",
      fillColor: "#ea6a43",
      fillOpacity: 0.9,
      weight: 1,
    }).bindPopup(
      `<strong>${escapeHtml(point.memberName)}</strong><br>${point.lat}, ${point.lng}<br>${new Date(
        point.createdAt
      ).toLocaleString()}`
    );
    marker.addTo(appState.layers.admin);
  }

  if (filteredPoints.length) {
    const latLngs = filteredPoints.map((point) => [point.lat, point.lng]);
    const bounds = L.latLngBounds(latLngs);
    appState.maps.admin.fitBounds(bounds, { padding: [30, 30] });
  }

  renderList(
    nodes.adminLocations,
    filteredPoints.map(
      (point, index) =>
        `${index + 1}. ${point.memberName} -> ${point.lat}, ${point.lng} (${new Date(
          point.createdAt
        ).toLocaleString()})`
    )
  );
}

function rebuildMemberFilter(members, selectedValue) {
  nodes.memberFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "ALL";
  allOption.textContent = "All Members";
  nodes.memberFilter.appendChild(allOption);

  for (const member of members) {
    const option = document.createElement("option");
    option.value = member;
    option.textContent = member;
    nodes.memberFilter.appendChild(option);
  }

  if (members.includes(selectedValue)) {
    nodes.memberFilter.value = selectedValue;
  } else {
    nodes.memberFilter.value = "ALL";
  }
}

function renderList(node, items) {
  node.innerHTML = "";
  if (!items.length) {
    const item = document.createElement("li");
    item.textContent = "No data available";
    node.appendChild(item);
    return;
  }

  for (const text of items) {
    const item = document.createElement("li");
    item.textContent = text;
    node.appendChild(item);
  }
}

async function refreshMembers() {
  try {
    const response = await fetch("/api/members");
    const payload = await response.json();
    appState.members = Array.isArray(payload.members) ? payload.members : [];
  } catch {
    appState.members = [];
  }
}

async function refreshMemberPoints() {
  if (!appState.currentMember) {
    appState.memberPoints = [];
    return;
  }

  try {
    appState.memberPoints = await apiGetPoints({
      memberName: appState.currentMember,
      dateMode: nodes.memberDateMode.value,
      date: nodes.memberDateInput.value,
    });
  } catch {
    appState.memberPoints = [];
  }
}

async function refreshAdminPoints() {
  try {
    appState.adminPoints = await apiGetPoints({
      memberName: nodes.memberFilter.value || "ALL",
      dateMode: nodes.adminDateMode.value,
      date: nodes.adminDateInput.value,
    });
  } catch {
    appState.adminPoints = [];
  }
}

async function apiMemberLogin(name) {
  const response = await fetch("/api/member-login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error("member login failed");
  }
}

async function apiCreatePoint(point) {
  const response = await fetch("/api/points", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(point),
  });

  if (!response.ok) {
    throw new Error("create point failed");
  }
}

async function apiGetPoints({ memberName, dateMode, date }) {
  const query = new URLSearchParams();
  if (memberName) {
    query.set("memberName", memberName);
  }
  if (dateMode) {
    query.set("dateMode", dateMode);
  }
  if (date) {
    query.set("date", date);
  }

  const response = await fetch(`/api/points?${query.toString()}`);
  if (!response.ok) {
    throw new Error("get points failed");
  }

  const payload = await response.json();
  return Array.isArray(payload.points) ? payload.points : [];
}

function toDateKey(dateLike) {
  const value = new Date(dateLike);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeName(name) {
  return name.replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
