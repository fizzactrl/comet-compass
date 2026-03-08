const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.NEBULA_API_KEY;
const BASE_URL = "https://api.utdnebula.com";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function stringifyObject(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

function objectMatchesQuery(item, rawQuery) {
  const full = normalizeText(stringifyObject(item));
  const q = normalizeText(rawQuery);
  return full.includes(q);
}

function extractBestTitle(item) {
  const possibleKeys = [
    "title",
    "name",
    "course_title",
    "courseName",
    "subject",
    "description",
    "prefix"
  ];

  for (const key of possibleKeys) {
    if (item && item[key]) return String(item[key]);
  }

  return "Destination found";
}

function findBuildingAndRoom(text) {
  const roomMatch = text.match(
    /\b(ECSW|ECSS|ECSN|JSOM|JO|SCI|SLC|SU|SSA|FO|FN|GR|AD|VCB|ATEC|BSB|CB1|CB2|HH|BE|PHY|NSERL)\s*-?\s*([A-Z]?\d(?:\.\d{3}|\d{2,3}))\b/i
  );

  if (roomMatch) {
    return {
      building: roomMatch[1].toUpperCase(),
      room: `${roomMatch[1].toUpperCase()} ${roomMatch[2].toUpperCase()}`
    };
  }

  const buildingMatch = text.match(
    /\b(ECSW|ECSS|ECSN|JSOM|JO|SCI|SLC|SU|SSA|FO|FN|GR|AD|VCB|ATEC|BSB|CB1|CB2|HH|BE|PHY|NSERL)\b/i
  );

  if (buildingMatch) {
    return {
      building: buildingMatch[1].toUpperCase(),
      room: null
    };
  }

  return {
    building: null,
    room: null
  };
}

async function nebulaFetch(url) {
  const res = await fetch(url, {
    headers: {
      "x-api-key": API_KEY
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nebula API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function searchCourseSections(rawQuery) {
  let former = 0;
  let latter = 20;
  let safety = 0;

  while (safety < 100) {
    const url = `${BASE_URL}/course/sections?former_offset=${former}&latter_offset=${latter}`;
    const payload = await nebulaFetch(url);
    const items = getItems(payload);

    if (items.length === 0) break;

    const found = items.find((item) => objectMatchesQuery(item, rawQuery));

    if (found) {
      const text = stringifyObject(found);
      const location = findBuildingAndRoom(text);

      return {
        source: "sections",
        title: extractBestTitle(found),
        raw: found,
        building: location.building,
        room: location.room
      };
    }

    if (items.length < 20) break;

    former += 20;
    latter += 20;
    safety++;
  }

  return null;
}

async function searchCourses(rawQuery) {
  let offset = 0;
  let safety = 0;

  while (safety < 100) {
    const url = `${BASE_URL}/course?offset=${offset}`;
    const payload = await nebulaFetch(url);
    const items = getItems(payload);

    if (items.length === 0) break;

    const found = items.find((item) => objectMatchesQuery(item, rawQuery));

    if (found) {
      const text = stringifyObject(found);
      const location = findBuildingAndRoom(text);

      return {
        source: "courses",
        title: extractBestTitle(found),
        raw: found,
        building: location.building,
        room: location.room
      };
    }

    if (items.length < 20) break;

    offset += 20;
    safety++;
  }

  return null;
}

app.get("/api/find-destination", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({
        error: "Missing NEBULA_API_KEY in .env"
      });
    }

    const q = String(req.query.q || "").trim();

    if (!q) {
      return res.status(400).json({
        error: "Please type a course or building."
      });
    }

    let result = await searchCourseSections(q);

    if (!result) {
      result = await searchCourses(q);
    }

    if (!result) {
      return res.status(404).json({
        error: "I could not find that in the Nebula API yet."
      });
    }

    return res.json({
      query: q,
      title: result.title,
      source: result.source,
      building: result.building,
      room: result.room,
      raw: result.raw
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error.message || "Server error"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});