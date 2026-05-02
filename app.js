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
  serverTimestamp,
  getDocs,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

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
  highlightLayer: null,
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
  adminEmail: document.getElementById("adminEmail"),
  adminStatus: document.getElementById("adminStatus"),
  adminContent: document.getElementById("adminContent"),
  memberFilter: document.getElementById("memberFilter"),
  adminDateMode: document.getElementById("adminDateMode"),
  adminDateInput: document.getElementById("adminDateInput"),
  memberList: document.getElementById("memberList"),
  adminLocations: document.getElementById("adminLocations"),
  locationNote: document.getElementById("locationNote"),
  locationPhoto: document.getElementById("locationPhoto")
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

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

window.panToMap = (lat, lng, mapType) => {
  const map = mapType === 'member' ? appState.maps.member : appState.maps.admin;
  const layerGroup = mapType === 'member' ? appState.layers.member : appState.layers.admin;
  
  if (map) {
    map.setView([lat, lng], 18);
    const panelId = mapType === 'member' ? "memberMap" : "adminMap";
    document.getElementById(panelId).scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Remove previous highlight if any
    if (appState.highlightLayer) {
      appState.highlightLayer.remove();
    }

    // Add a highly visible ring to highlight the chosen location
    appState.highlightLayer = L.circleMarker([lat, lng], {
      radius: 25,
      color: "#ff0000",
      fillColor: "#ffeb3b",
      fillOpacity: 0.6,
      weight: 4,
      dashArray: "5, 5"
    }).addTo(map);

    // Find the original marker and open its popup
    layerGroup.eachLayer((layer) => {
      const pos = layer.getLatLng();
      // Match coordinates closely
      if (Math.abs(pos.lat - lat) < 0.00001 && Math.abs(pos.lng - lng) < 0.00001) {
        layer.openPopup();
      }
    });
  }
};

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
    } catch (err) {
      console.error("Login Error:", err);
      nodes.memberStatus.textContent = "Error: " + err.message;
    }
  });
}

function setupAdminLogin() {
  nodes.adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = nodes.adminEmail.value.trim().toLowerCase();

    nodes.adminStatus.textContent = "Checking admin access...";

    try {
      const adminQuery = query(
        collection(db, "Location_Pinpoint", "project_data", "admins"),
        where("email", "==", email)
      );
      const snapshot = await getDocs(adminQuery);

      if (snapshot.empty) {
        appState.adminUnlocked = false;
        nodes.adminStatus.textContent = "Access denied. Admin email not found.";
        nodes.adminContent.classList.add("hidden");
        return;
      }

      appState.adminUnlocked = true;
      nodes.adminStatus.textContent = "Admin unlocked.";
      nodes.adminContent.classList.remove("hidden");
      nodes.adminEmail.value = "";
      renderAdminSection();
      setTimeout(() => appState.maps.admin.invalidateSize(), 100);
    } catch (err) {
      console.error("Admin Login Error:", err);
      nodes.adminStatus.textContent = "Error checking access: " + err.message;
    }
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

    const note = nodes.locationNote.value.trim();
    const photoFile = nodes.locationPhoto.files[0];
    
    let photoUrl = null;
    if (photoFile) {
      nodes.memberStatus.textContent = "Uploading photo... Please wait.";
      nodes.pinLiveLocationBtn.disabled = true;
      const fileExt = photoFile.name.split('.').pop();
      const storageRef = ref(storage, `location_photos/${Date.now()}_${appState.currentMember}.${fileExt}`);
      try {
        const snapshot = await uploadBytesResumable(storageRef, photoFile);
        photoUrl = await getDownloadURL(snapshot.ref);
      } catch (err) {
        nodes.memberStatus.textContent = "Photo upload failed. Please try again.";
        nodes.pinLiveLocationBtn.disabled = false;
        return;
      }
    }

    const point = {
      memberName: appState.currentMember,
      lat: Number(appState.livePosition.lat.toFixed(6)),
      lng: Number(appState.livePosition.lng.toFixed(6)),
      note: note,
      photoUrl: photoUrl,
      createdAtMs: Date.now(),
      createdAtIso: new Date().toISOString()
    };

    try {
      await addPoint(point);
      nodes.memberStatus.textContent = "Live location pinned successfully.";
      nodes.locationNote.value = "";
      nodes.locationPhoto.value = "";
    } catch {
      nodes.memberStatus.textContent = "Could not save point. Please retry.";
    } finally {
      nodes.pinLiveLocationBtn.disabled = false;
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
  const memberQuery = query(collection(db, "Location_Pinpoint", "project_data", "members"), orderBy("name", "asc"));
  const pointQuery = query(collection(db, "Location_Pinpoint", "project_data", "points"), orderBy("createdAtMs", "desc"));

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
    let popupContent = `<strong>${escapeHtml(point.memberName)}</strong><br>${point.lat}, ${point.lng}`;
    if (point.note) {
      popupContent += `<br><em>${escapeHtml(point.note)}</em>`;
    }
    if (point.photoUrl) {
      popupContent += `<br><a href="${escapeHtml(point.photoUrl)}" target="_blank"><img src="${escapeHtml(point.photoUrl)}" style="width: 100px; margin-top: 5px; border-radius: 4px;" alt="Location Photo" /></a>`;
    }
    popupContent += `<br><a href="https://www.google.com/maps?q=${point.lat},${point.lng}" target="_blank">View on Google Maps</a>`;

    const marker = L.marker([point.lat, point.lng]).bindPopup(popupContent);
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
      let extraHtml = '';
      if (point.photoUrl) {
        extraHtml += `<div style="margin-top: 8px;"><img src="${escapeHtml(point.photoUrl)}" style="max-width: 200px; border-radius: 6px; display: block;" alt="Location Photo" /></div>`;
      }
      if (point.note) {
        extraHtml += `<div style="margin-top: 4px; font-style: italic; color: #555;">Note: ${escapeHtml(point.note)}</div>`;
      }
      return { html: `<div style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>${index + 1}.</strong> <a href="javascript:void(0)" onclick="window.panToMap(${point.lat}, ${point.lng}, 'member')" style="color: #0d7a69; font-weight: bold; text-decoration: underline; cursor: pointer;" title="Show on map">${point.lat}, ${point.lng}</a> <span style="color: #888; font-size: 0.9em;">(${dateText})</span>${extraHtml}</div>` };
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
    let popupContent = `<strong>${escapeHtml(point.memberName)}</strong><br>${point.lat}, ${point.lng}<br>${new Date(point.createdAtMs || point.createdAtIso || Date.now()).toLocaleString()}`;
    if (point.note) {
      popupContent += `<br><em>${escapeHtml(point.note)}</em>`;
    }
    if (point.photoUrl) {
      popupContent += `<br><a href="${escapeHtml(point.photoUrl)}" target="_blank"><img src="${escapeHtml(point.photoUrl)}" style="width: 100px; margin-top: 5px; border-radius: 4px;" alt="Location Photo" /></a>`;
    }
    popupContent += `<br><a href="https://www.google.com/maps?q=${point.lat},${point.lng}" target="_blank">View on Google Maps</a>`;

    const marker = L.circleMarker([point.lat, point.lng], {
      radius: 7,
      color: "#0d7a69",
      fillColor: "#ea6a43",
      fillOpacity: 0.9,
      weight: 1
    }).bindPopup(popupContent);
    marker.addTo(appState.layers.admin);
  }

  if (filteredPoints.length) {
    const latLngs = filteredPoints.map((point) => [point.lat, point.lng]);
    const bounds = L.latLngBounds(latLngs);
    appState.maps.admin.fitBounds(bounds, { padding: [30, 30] });
  }

  renderList(
    nodes.adminLocations,
    filteredPoints.map((point, index) => {
      const dateText = new Date(point.createdAtMs || point.createdAtIso || Date.now()).toLocaleString();
      let extraHtml = '';
      if (point.photoUrl) {
        extraHtml += `<div style="margin-top: 8px;"><img src="${escapeHtml(point.photoUrl)}" style="max-width: 200px; border-radius: 6px; display: block;" alt="Location Photo" /></div>`;
      }
      if (point.note) {
        extraHtml += `<div style="margin-top: 4px; font-style: italic; color: #555;">Note: ${escapeHtml(point.note)}</div>`;
      }
      return { html: `<div style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>${index + 1}. ${escapeHtml(point.memberName)}</strong> &rarr; <a href="javascript:void(0)" onclick="window.panToMap(${point.lat}, ${point.lng}, 'admin')" style="color: #0d7a69; font-weight: bold; text-decoration: underline; cursor: pointer;" title="Show on map">${point.lat}, ${point.lng}</a> <span style="color: #888; font-size: 0.9em;">(${dateText})</span>${extraHtml}</div>` };
    })
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

  for (const itemData of items) {
    const item = document.createElement("li");
    if (typeof itemData === 'string') {
      item.textContent = itemData;
    } else if (itemData && itemData.html) {
      item.innerHTML = itemData.html;
    }
    node.appendChild(item);
  }
}

async function upsertMember(name) {
  const memberId = encodeURIComponent(name.toLowerCase());
  const ref = doc(db, "Location_Pinpoint", "project_data", "members", memberId);
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
  await addDoc(collection(db, "Location_Pinpoint", "project_data", "points"), {
    memberName: point.memberName,
    lat: point.lat,
    lng: point.lng,
    note: point.note || null,
    photoUrl: point.photoUrl || null,
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
