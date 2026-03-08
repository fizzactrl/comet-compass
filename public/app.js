const queryInput = document.getElementById("queryInput");
const findBtn = document.getElementById("findBtn");
const cameraBtn = document.getElementById("cameraBtn");
const sensorBtn = document.getElementById("sensorBtn");
const statusBox = document.getElementById("status");
const destinationBox = document.getElementById("destinationBox");
const arrowCluster = document.getElementById("arrowCluster");
const guidance = document.getElementById("guidance");
const video = document.getElementById("video");

const userDot = document.getElementById("userDot");
const destDot = document.getElementById("destDot");
const mapLine = document.getElementById("mapLine");
const mapMeta = document.getElementById("mapMeta");

let currentHeading = 0;
let currentPosition = null;
let destination = null;
let lastSpoken = "";
let watchId = null;

const buildingCoords = {
  ECSW: { lat: 32.9861, lng: -96.7504, label: "ECSW" },
  ECSS: { lat: 32.9863, lng: -96.7498, label: "ECSS" },
  ECSN: { lat: 32.9864, lng: -96.7508, label: "ECSN" },
  JSOM: { lat: 32.9852, lng: -96.7490, label: "JSOM" },
  JO:   { lat: 32.9852, lng: -96.7490, label: "JO" },
  SCI:  { lat: 32.9869, lng: -96.7486, label: "SCI" },
  SU:   { lat: 32.9860, lng: -96.7480, label: "SU" },
  SSA:  { lat: 32.9870, lng: -96.7494, label: "SSA" },
  FO:   { lat: 32.9877, lng: -96.7500, label: "FO" },
  FN:   { lat: 32.9880, lng: -96.7497, label: "FN" },
  GR:   { lat: 32.9872, lng: -96.7474, label: "GR" },
  ATEC: { lat: 32.9922, lng: -96.7503, label: "ATEC" },
  HH:   { lat: 32.9881, lng: -96.7469, label: "HH" }
};

function setStatus(message) {
  statusBox.textContent = message;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  if (text === lastSpoken) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.lang = "en-US";
  speechSynthesis.speak(utterance);
  lastSpoken = text;
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }
      },
      audio: false
    });

    video.srcObject = stream;
    setStatus("Camera started successfully.");
  } catch (error) {
    console.error(error);
    setStatus("Could not start camera. Please allow camera permission.");
  }
}

function startLocation() {
  if (!("geolocation" in navigator)) {
    setStatus("Geolocation is not supported on this device.");
    return;
  }

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      currentPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      updateArrowAndGuidance();
      updateMiniMap();
    },
    (error) => {
      console.error(error);
      setStatus("Please allow location permission.");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
}

function handleOrientation(event) {
  let heading = null;

  if (typeof event.webkitCompassHeading === "number") {
    heading = event.webkitCompassHeading;
  } else if (typeof event.alpha === "number") {
    heading = 360 - event.alpha;
  }

  if (heading !== null && !Number.isNaN(heading)) {
    currentHeading = heading;
    updateArrowAndGuidance();
  }
}

async function enableCompass() {
  try {
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") {
        setStatus("Compass permission denied.");
        return;
      }
    }

    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    window.addEventListener("deviceorientation", handleOrientation, true);

    startLocation();
    setStatus("Compass enabled. You can now rotate your phone.");
  } catch (error) {
    console.error(error);
    setStatus("Could not enable compass on this device.");
  }
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

function calculateBearing(lat1, lng1, lat2, lng2) {
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const λ1 = toRadians(lng1);
  const λ2 = toRadians(lng2);

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);

  let bearing = toDegrees(Math.atan2(y, x));
  bearing = (bearing + 360) % 360;
  return bearing;
}

function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalizeAngle(angle) {
  let a = angle;
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  return a;
}

function guidanceFromTurn(turnAngle, distanceMeters) {
  if (distanceMeters < 15) {
    return "You have arrived.";
  }

  if (Math.abs(turnAngle) < 15) {
    return "Go straight.";
  }

  if (turnAngle >= 15 && turnAngle < 45) {
    return "Turn slightly right.";
  }

  if (turnAngle <= -15 && turnAngle > -45) {
    return "Turn slightly left.";
  }

  if (turnAngle >= 45) {
    return "Turn right.";
  }

  if (turnAngle <= -45) {
    return "Turn left.";
  }

  return "Move forward.";
}

function updateArrowAndGuidance() {
  if (!currentPosition || !destination) return;

  const bearing = calculateBearing(
    currentPosition.lat,
    currentPosition.lng,
    destination.lat,
    destination.lng
  );

  const turnAngle = normalizeAngle(bearing - currentHeading);
  const distanceMeters = calculateDistanceMeters(
    currentPosition.lat,
    currentPosition.lng,
    destination.lat,
    destination.lng
  );

  arrowCluster.style.transform =
    `translate(-50%, -50%) rotate(${turnAngle}deg) translateY(${Math.max(-8, -Math.min(distanceMeters / 12, 26))}px)`;

  const message = `${guidanceFromTurn(turnAngle, distanceMeters)} ${Math.round(distanceMeters)} meters away.`;
  guidance.textContent = message;

  if (distanceMeters < 15) {
    speak("You have arrived.");
  } else if (Math.abs(turnAngle) < 15) {
    speak("Go straight.");
  } else if (turnAngle > 0) {
    speak("Turn right.");
  } else {
    speak("Turn left.");
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateMiniMap() {
  if (!currentPosition || !destination) {
    mapMeta.textContent = "Waiting for location and destination...";
    return;
  }

  const dx = (destination.lng - currentPosition.lng) * 90000;
  const dy = (destination.lat - currentPosition.lat) * -111000;

  const userX = 28;
  const userY = 68;

  const scaledX = clamp(userX + dx / 8, 12, 88);
  const scaledY = clamp(userY + dy / 8, 12, 88);

  userDot.style.left = `${userX}%`;
  userDot.style.top = `${userY}%`;

  destDot.style.left = `${scaledX}%`;
  destDot.style.top = `${scaledY}%`;

  const deltaX = scaledX - userX;
  const deltaY = scaledY - userY;
  const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

  mapLine.style.left = `${userX}%`;
  mapLine.style.top = `${userY}%`;
  mapLine.style.width = `${length}%`;
  mapLine.style.transform = `rotate(${angle}deg)`;

  const distanceMeters = calculateDistanceMeters(
    currentPosition.lat,
    currentPosition.lng,
    destination.lat,
    destination.lng
  );

  mapMeta.textContent = `Distance: ${Math.round(distanceMeters)} m • Heading: ${Math.round(currentHeading)}°`;
}

async function findDestination() {
  const q = queryInput.value.trim();

  if (!q) {
    setStatus("Type something first, like ECSW or CS 1337.");
    return;
  }

  const buildingDirect = q.toUpperCase();

  if (buildingCoords[buildingDirect]) {
    destination = buildingCoords[buildingDirect];

    destinationBox.innerHTML = `
      <strong>Building:</strong> ${buildingDirect}<br>
      <strong>Navigation Mode:</strong> Direct building navigation<br>
      <strong>Coordinates:</strong> ${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}
    `;

    setStatus(`Destination set: ${buildingDirect}`);
    guidance.textContent = `Head toward ${buildingDirect}`;
    speak(`Destination set. Head toward ${buildingDirect}`);
    updateArrowAndGuidance();
    updateMiniMap();
    return;
  }

  setStatus("Searching Nebula API...");

  try {
    const res = await fetch(`/api/find-destination?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Search failed.");
    }

    const buildingCode = data.building ? data.building.toUpperCase() : null;
    const coords = buildingCode ? buildingCoords[buildingCode] : null;

    destinationBox.innerHTML = `
      <strong>Query:</strong> ${data.query}<br>
      <strong>Title:</strong> ${data.title || "Unknown"}<br>
      <strong>Building:</strong> ${data.building || "Not found yet"}<br>
      <strong>Room:</strong> ${data.room || "Not found yet"}<br>
      <strong>Source:</strong> ${data.source}
    `;

    if (!buildingCode) {
      setStatus("I found course data, but no building code was detected.");
      guidance.textContent = "Building code not detected yet.";
      return;
    }

    if (!coords) {
      setStatus(`Found building ${buildingCode}, but coordinates are missing in app.js.`);
      guidance.textContent = `Add coordinates for ${buildingCode}`;
      return;
    }

    destination = {
      lat: coords.lat,
      lng: coords.lng,
      building: buildingCode,
      room: data.room || null
    };

    setStatus(`Destination set from Nebula: ${buildingCode}`);
    guidance.textContent = `Destination is ${buildingCode}. Point your phone around.`;
    speak(`Destination found. Head toward ${buildingCode}.`);
    updateArrowAndGuidance();
    updateMiniMap();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Something went wrong.");
  }
}

findBtn.addEventListener("click", findDestination);
cameraBtn.addEventListener("click", startCamera);
sensorBtn.addEventListener("click", enableCompass);

queryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    findDestination();
  }
});

setStatus("Press Start Camera, then Enable Compass, then search.");