/* =========================================================
   Leaflet map — Acteurs VBG Kolda
   - Charge GeoJSON
   - Symbologie par type d’acteur (étatique vs OSC)
   - Popups: structure, services, contacts
   - Filtres: type d’acteur + type de service
   - Recherche: nom de structure
   ========================================================= */

"use strict";

const GEOJSON_URL = "./data/actors_vbg_kolda.geojson";

// Kolda approx (Leaflet: [lat, lng])
const MAP_DEFAULT = { center: [12.9, -14.95], zoom: 9 };

/* ----------------------------
   Helpers
---------------------------- */
function safe(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s === "" ? "" : s;
}

function escHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function splitTags(value) {
  const v = safe(value);
  if (!v) return [];
  return v
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function isStateActor(actorType) {
  const t = safe(actorType).toLowerCase();
  return (
    t.includes("service") ||
    t.includes("étatique") ||
    t.includes("etat") ||
    t.includes("état") ||
    t.includes("state")
  );
}

/* ----------------------------
   Icons & Styles
---------------------------- */
function triangleIcon() {
  return L.divIcon({
    className: "triangle-marker",
    html: `
      <div style="
        width:0;height:0;
        border-left:8px solid transparent;
        border-right:8px solid transparent;
        border-bottom:14px solid #111;
        filter: drop-shadow(0 2px 3px rgba(0,0,0,.25));
      "></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 14],
    popupAnchor: [0, -14],
  });
}

/* ----------------------------
   Popup builder
---------------------------- */
function makePopup(props = {}) {
  const name = escHtml(safe(props.structure) || "Structure (non renseignée)");
  const type = escHtml(safe(props.actor_type));
  const services = escHtml(safe(props.service_domains));
  const gbvTypesArr = splitTags(props.service_gbv_type);
  const gbvTypes = gbvTypesArr
    .map((t) => `<span class="tag">${escHtml(t)}</span>`)
    .join(" ");
  const targets = escHtml(safe(props.target_groups));
  const coverage = escHtml(safe(props.coverage_level));

  const deptsRaw =
    props["departement(s)"] ?? props.departement ?? props.departements ?? "";
  const depts = escHtml(safe(deptsRaw));

  const phone = escHtml(safe(props.phone));
  const email = escHtml(safe(props.email));
  const address = escHtml(safe(props.address));

  const contactLine = [
    phone ? `📞 ${phone}` : "",
    email ? `✉️ ${email}` : "",
  ]
    .filter(Boolean)
    .join(" • ");

  return `
    <div class="popup">
      <h3>${name}</h3>
      <p class="meta">${type || "Type non renseigné"}${coverage ? " • " + coverage : ""}</p>
      ${gbvTypes ? `<div class="tags">${gbvTypes}</div>` : ""}
      ${services ? `<div class="row"><span class="label">Services :</span> ${services}</div>` : ""}
      ${targets ? `<div class="row"><span class="label">Cibles :</span> ${targets}</div>` : ""}
      ${depts ? `<div class="row"><span class="label">Départements :</span> ${depts}</div>` : ""}
      ${address ? `<div class="row"><span class="label">Adresse :</span> ${address}</div>` : ""}
      ${contactLine ? `<div class="row"><span class="label">Contacts :</span> ${contactLine}</div>` : ""}
    </div>
  `;
}

/* ----------------------------
   Init map
---------------------------- */
const map = L.map("map", { preferCanvas: true }).setView(
  MAP_DEFAULT.center,
  MAP_DEFAULT.zoom
);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

/* ----------------------------
   State
---------------------------- */
let rawFeatures = [];
let layerAll = null;
let allBounds = null;

const filterActorEl = document.getElementById("filter-actor");
const filterServiceEl = document.getElementById("filter-service");
const searchEl = document.getElementById("search");
const btnFit = document.getElementById("btn-fit");
const btnReset = document.getElementById("btn-reset");

/* ----------------------------
   UI builders
---------------------------- */
function populateServiceFilter(features) {
  const set = new Set();
  features.forEach((f) => {
    const p = f.properties || {};
    splitTags(p.service_gbv_type).forEach((t) => set.add(t));
  });

  const opts = Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));

  filterServiceEl.innerHTML = `<option value="all">Tous types de services</option>`;
  opts.forEach((v) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    filterServiceEl.appendChild(o);
  });
}

function currentFilters() {
  return {
    actor: filterActorEl?.value || "all", // all | state | osc
    service: filterServiceEl?.value || "all", // all | serviceTag
    search: safe(searchEl?.value).toLowerCase(),
  };
}

function featureMatchesFilters(f, filters) {
  const p = f.properties || {};
  const actorType = safe(p.actor_type);
  const state = isStateActor(actorType);

  if (filters.actor === "state" && !state) return false;
  if (filters.actor === "osc" && state) return false;

  if (filters.service !== "all") {
    const tags = splitTags(p.service_gbv_type).map((x) => x.toLowerCase());
    if (!tags.includes(filters.service.toLowerCase())) return false;
  }

  if (filters.search) {
    const name = safe(p.structure).toLowerCase();
    if (!name.includes(filters.search)) return false;
  }

  return true;
}

/* ----------------------------
   Layer builder
---------------------------- */
function buildLayer(features) {
  return L.geoJSON(features, {
    pointToLayer: (feature, latlng) => {
      const p = feature.properties || {};
      const state = isStateActor(p.actor_type);

      if (state) {
        return L.circleMarker(latlng, {
          radius: 6,
          fillColor: "#1f5fa8",
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        });
      }

      return L.marker(latlng, { icon: triangleIcon() });
    },

    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      const nameLower = safe(p.structure).toLowerCase();

      // used for auto-open after search
      layer.__name = nameLower;

      layer.bindPopup(makePopup(p), { maxWidth: 420 });
    },
  });
}

/* ----------------------------
   Redraw + bounds
---------------------------- */
function redraw() {
  const filters = currentFilters();
  const filtered = rawFeatures.filter((f) => featureMatchesFilters(f, filters));

  if (layerAll) map.removeLayer(layerAll);
  layerAll = buildLayer(filtered).addTo(map);

  const group = L.featureGroup([layerAll]);
  const b = group.getBounds();
  if (b && b.isValid()) allBounds = b;

  // Open first match if user typed something
  if (filters.search && filtered.length > 0) {
    let opened = false;
    layerAll.eachLayer((l) => {
      if (opened) return;
      if (l.__name && l.__name.includes(filters.search)) {
        l.openPopup();
        if (l.getLatLng) map.panTo(l.getLatLng());
        opened = true;
      }
    });
  }
}

function fitToData() {
  if (allBounds && allBounds.isValid()) {
    map.fitBounds(allBounds.pad(0.15));
  } else {
    map.setView(MAP_DEFAULT.center, MAP_DEFAULT.zoom);
  }
}

/* ----------------------------
   Events
---------------------------- */
btnFit?.addEventListener("click", fitToData);

btnReset?.addEventListener("click", () => {
  if (filterActorEl) filterActorEl.value = "all";
  if (filterServiceEl) filterServiceEl.value = "all";
  if (searchEl) searchEl.value = "";
  redraw();
  fitToData();
});

filterActorEl?.addEventListener("change", redraw);
filterServiceEl?.addEventListener("change", redraw);

searchEl?.addEventListener("input", () => {
  redraw();
});

/* ----------------------------
   Load GeoJSON
---------------------------- */
fetch(GEOJSON_URL, { cache: "no-store" })
  .then((r) => {
    if (!r.ok) throw new Error(`GeoJSON introuvable: ${GEOJSON_URL}`);
    return r.json();
  })
  .then((geo) => {
    rawFeatures = Array.isArray(geo?.features) ? geo.features : [];
    populateServiceFilter(rawFeatures);
    redraw();
    setTimeout(fitToData, 250);
  })
  .catch((err) => {
    console.error(err);
    alert(
      "Erreur: impossible de charger le GeoJSON. Vérifiez ./data/actors_vbg_kolda.geojson"
    );
  });
