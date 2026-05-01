import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, ADMIN_PASSWORD } from "./firebase-config.js";

const appState = {
  currentMember: null,
  adminUnlocked: false,
  livePosition: null,
  liveMarker: null,
  watchId: null,
  members: [],
  allPoints: [],
  maps: {
    member: null,
    admin: null
  },
  layers: {
    member: null,
    admin: null
  },
  unsubscribers: []
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
  adminLocations: document.getElementById("adminLocations")
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

setupTabs();
setupMemberMap();
setupAdminMap();
setupMemberLogin();
setupAdminLogin();
setupFilter();
setupPinLiveLocation();
setupDateFilters();
updateDateInputState();
subscribeRealtimeData();
renderMemberSection();
renderAdminSection();

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
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(appState.maps.member);
}

function setupAdminMap() {
  appState.maps.admin = L.map("adminMap").setView([20.5937, 78.9629], 5);
  appState.layers.admin = L.layerGroup().addTo(appState.maps.admin);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
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
      await upsertMember(name);
      appState.currentMember = name;
      nodes.memberName.value = "";
      nodes.memberStatus.textContent = `Logged in as ${name}. Allow location access to sync live position.`;
      requestLiveLocationAccess();
      renderMemberSection();
      renderAdminSection();
    } catch {
      nodes.memberStatus.textContent = "Could not login right now. Please try again.";
    }
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
      memberName: appState.currentMember,
      lat: Number(appState.livePosition.lat.toFixed(6)),
      lng: Number(appState.livePosition.lng.toFixed(6)),
      createdAtMs: Date.now(),
      createdAtIso: new Date().toISOString()
    };

    try {
      await addPoint(point);
      nodes.memberStatus.textContent = "Live location pinned successfully.";
    } catch {
      nodes.memberStatus.textContent = "Could not save point. Please retry.";
    }
  });
}

function setupDateFilters() {
  nodes.memberDateMode.addEventListener("change", () => {
    updateDateInputState();
    renderMemberSection();
  });

  nodes.memberDateInput.addEventListener("change", () => {
    renderMemberSection();
  });

  nodes.adminDateMode.addEventListener("change", () => {
    updateDateInputState();
    if (!appState.adminUnlocked) {
      return;
    }
    renderAdminSection();
  });

  nodes.adminDateInput.addEventListener("change", () => {
    if (!appState.adminUnlocked) {
      return;
    }
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
          weight: 2
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
      maximumAge: 2000
    }
  );
}

function subscribeRealtimeData() {
  const memberQuery = query(collection(db, "members"), orderBy("name", "asc"));
  const pointQuery = query(collection(db, "points"), orderBy("createdAtMs", "desc"));

  const unsubMembers = onSnapshot(
    memberQuery,
    (snapshot) => {
      appState.members = snapshot.docs.map((d) => d.data().name).filter(Boolean);
      renderAdminSection();
    },
    () => {
      nodes.memberStatus.textContent = "Realtime sync failed for members.";
    }
  );

  const unsubPoints = onSnapshot(
    pointQuery,
    (snapshot) => {
      appState.allPoints = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderMemberSection();
      renderAdminSection();
    },
    () => {
      nodes.memberStatus.textContent = "Realtime sync failed for points.";
    }
  );

  appState.unsubscribers.push(unsubMembers, unsubPoints);
}

function renderMemberSection() {
  appState.layers.member.clearLayers();

  if (!appState.currentMember) {
    renderList(nodes.memberLocations, []);
    return;
  }

  const ownPoints = appState.allPoints.filter((point) => point.memberName === appState.currentMember);
  const points = applyDateFilter(ownPoints, nodes.memberDateMode.value, nodes.memberDateInput.value);

  for (const point of points) {
    const marker = L.marker([point.lat, point.lng]).bindPopup(
      `<strong>${escapeHtml(point.memberName)}</strong><br>${point.lat}, ${point.lng}`
    );
    marker.addTo(appState.layers.member);
  }

  if (points.length) {
    const latest = points[0];
    appState.maps.member.setView([latest.lat, latest.lng], 12);
  }

  renderList(
    nodes.memberLocations,
    points.map((point, index) => {
      const dateText = new Date(point.createdAtMs || point.createdAtIso || Date.now()).toLocaleString();
      return `${index + 1}. ${point.lat}, ${point.lng} (${dateText})`;
    })
  );
}

function renderAdminSection() {
  const selected = nodes.memberFilter.value || "ALL";
  const members = [...appState.members];

  rebuildMemberFilter(members, selected);

  const filterValue = nodes.memberFilter.value;
  const nameFilteredPoints =
    filterValue === "ALL"
      ? [...appState.allPoints]
      : appState.allPoints.filter((point) => point.memberName === filterValue);
  const filteredPoints = applyDateFilter(
    nameFilteredPoints,
    nodes.adminDateMode.value,
    nodes.adminDateInput.value
  );

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
      weight: 1
    }).bindPopup(
      `<strong>${escapeHtml(point.memberName)}</strong><br>${point.lat}, ${point.lng}<br>${new Date(
        point.createdAtMs || point.createdAtIso || Date.now()
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
          point.createdAtMs || point.createdAtIso || Date.now()
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

async function upsertMember(name) {
  const memberId = encodeURIComponent(name.toLowerCase());
  const ref = doc(db, "members", memberId);
  await setDoc(
    ref,
    {
      name,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

async function addPoint(point) {
  await addDoc(collection(db, "points"), {
    memberName: point.memberName,
    lat: point.lat,
    lng: point.lng,
    createdAtMs: point.createdAtMs,
    createdAtIso: point.createdAtIso,
    createdAt: serverTimestamp()
  });
}

function applyDateFilter(points, mode, inputDate) {
  if (mode === "TODAY") {
    const today = toDateKey(new Date());
    return points.filter((point) => toDateKey(point.createdAtMs || point.createdAtIso) === today);
  }

  if (mode === "DATE") {
    if (!inputDate) {
      return [];
    }
    return points.filter((point) => toDateKey(point.createdAtMs || point.createdAtIso) === inputDate);
  }

  return points;
}

function toDateKey(dateLike) {
  const value = new Date(dateLike);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeName(name) {
  return String(name).replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
