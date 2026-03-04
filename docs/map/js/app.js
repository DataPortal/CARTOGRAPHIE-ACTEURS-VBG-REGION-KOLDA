/* =========================================================
   Leaflet map — Acteurs VBG Kolda
   - Charge GeoJSON
   - Symbologie par type d’acteur (étatique vs OSC)
   - Popups: structure, services, contacts
   - Filtres: type d’acteur + type de service
   - Recherche: nom de structure
   ========================================================= */

const GEOJSON_URL = "./data/actors_vbg_kolda.geojson";

// Kolda approx
const MAP_DEFAULT = { center: [12.9, -14.95], zoom: 9 };

// Helpers
function safe(v){
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s === "" ? "" : s;
}
function escHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function splitTags(value){
  const v = safe(value);
  if (!v) return [];
  return v.split(/[;,]/).map(x => x.trim()).filter(Boolean);
}
function isStateActor(actorType){
  const t = safe(actorType).toLowerCase();
  return (t.includes("service") || t.includes("étatique") || t.includes("etat") || t.includes("state"));
}

function triangleIcon(){
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
    iconAnchor: [8, 14]
  });
}

function makePopup(props){
  const name = escHtml(safe(props.structure) || "Structure (non renseigné)");
  const type = escHtml(safe(props.actor_type));
  const services = escHtml(safe(props.service_domains));
  const gbvTypesArr = splitTags(props.service_gbv_type);
  const gbvTypes = gbvTypesArr.map(t => `<span class="tag">${escHtml(t)}</span>`).join(" ");
  const targets = escHtml(safe(props.target_groups));
  const coverage = escHtml(safe(props.coverage_level));
  const depts = escHtml(safe(props["departement(s)"] || props.departement || props.departements));
  const phone = escHtml(safe(props.phone));
  const email = escHtml(safe(props.email));
  const address = escHtml(safe(props.address));

  const contactLine = [
    phone ? `📞 ${phone}` : "",
    email ? `✉️ ${email}` : ""
  ].filter(Boolean).join(" • ");

  return `
    <div class="popup">
      <h3>${name}</h3>
      <p class="meta">${type ? type : "Type non renseigné"} ${coverage ? "• " + coverage : ""}</p>
      ${gbvTypes ? `<div>${gbvTypes}</div>` : ""}
      ${services ? `<div class="row"><span class="label">Services :</span> ${services}</div>` : ""}
      ${targets ? `<div class="row"><span class="label">Cibles :</span> ${targets}</div>` : ""}
      ${depts ? `<div class="row"><span class="label">Départements :</span> ${depts}</div>` : ""}
      ${address ? `<div class="row"><span class="label">Adresse :</span> ${address}</div>` : ""}
      ${contactLine ? `<div class="row"><span class="label">Contacts :</span> ${contactLine}</div>` : ""}
    </div>
  `;
}

// Init map
const map = L.map("map").setView(MAP_DEFAULT.center, MAP_DEFAULT.zoom);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// State
let rawFeatures = [];
let layerAll = null;
let allBounds = null;

const filterActorEl = document.getElementById("filter-actor");
const filterServiceEl = document.getElementById("filter-service");
const searchEl = document.getElementById("search");

// Build service filter options
function populateServiceFilter(features){
  const set = new Set();
  features.forEach(f=>{
    const p = f.properties || {};
    splitTags(p.service_gbv_type).forEach(t => set.add(t));
  });
  const opts = Array.from(set).sort((a,b)=>a.localeCompare(b, "fr"));
  // reset
  filterServiceEl.innerHTML = `<option value="all">Tous types de services</option>`;
  opts.forEach(v=>{
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    filterServiceEl.appendChild(o);
  });
}

function currentFilters(){
  return {
    actor: filterActorEl.value,   // all | state | osc
    service: filterServiceEl.value, // all | serviceTag
    search: safe(searchEl.value).toLowerCase()
  };
}

function featureMatchesFilters(f, filters){
  const p = f.properties || {};
  const actorType = safe(p.actor_type);
  const isState = isStateActor(actorType);

  // actor filter
  if (filters.actor === "state" && !isState) return false;
  if (filters.actor === "osc" && isState) return false;

  // service filter (tag)
  if (filters.service !== "all"){
    const tags = splitTags(p.service_gbv_type).map(x=>x.toLowerCase());
    if (!tags.includes(filters.service.toLowerCase())) return false;
  }

  // search (structure)
  if (filters.search){
    const name = safe(p.structure).toLowerCase();
    if (!name.includes(filters.search)) return false;
  }
  return true;
}

function buildLayer(features){
  return L.geoJSON(features, {
    pointToLayer: (feature, latlng) => {
      const p = feature.properties || {};
      if (isStateActor(p.actor_type)){
        return L.circleMarker(latlng, {
          radius: 6,
          fillColor: "#1f5fa8",
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9
        });
      }
      return L.marker(latlng, { icon: triangleIcon() });
    },
    function onEachFeature(feature, layer) {

const p = feature.properties;

layer.bindPopup(`
<b>${p.structure}</b><br>
Type : ${p.actor_type}<br>
Services : ${p.service_domains}<br>
Téléphone : ${p.phone || "N/A"}<br>
Email : ${p.email || "N/A"}<br>
Adresse : ${p.address || ""}
`);

}

function redraw(){
  const filters = currentFilters();
  const filtered = rawFeatures.filter(f => featureMatchesFilters(f, filters));

  if (layerAll) map.removeLayer(layerAll);
  layerAll = buildLayer(filtered).addTo(map);

  // bounds
  const group = L.featureGroup([layerAll]);
  const b = group.getBounds();
  if (b && b.isValid()) allBounds = b;

  // if search is used, open first match popup
  if (filters.search && filtered.length > 0){
    let opened = false;
    layerAll.eachLayer(l=>{
      if (!opened && l.__name && l.__name.includes(filters.search)){
        l.openPopup();
        map.panTo(l.getLatLng ? l.getLatLng() : map.getCenter());
        opened = true;
      }
    });
  }
}

function fitToData(){
  if (allBounds && allBounds.isValid()){
    map.fitBounds(allBounds.pad(0.15));
  }
}

document.getElementById("btn-fit").addEventListener("click", fitToData);
document.getElementById("btn-reset").addEventListener("click", () => {
  filterActorEl.value = "all";
  filterServiceEl.value = "all";
  searchEl.value = "";
  redraw();
  fitToData();
});

filterActorEl.addEventListener("change", redraw);
filterServiceEl.addEventListener("change", redraw);
searchEl.addEventListener("input", () => {
  // redraw live (simple & efficace)
  redraw();
});

// Load GeoJSON
fetch(GEOJSON_URL)
  .then(r => {
    if (!r.ok) throw new Error(`GeoJSON introuvable: ${GEOJSON_URL}`);
    return r.json();
  })
  .then(geo => {
    rawFeatures = geo.features || [];
    populateServiceFilter(rawFeatures);
    redraw();

    // initial fit
    setTimeout(fitToData, 250);
  })
  .catch(err => {
    console.error(err);
    alert("Erreur: impossible de charger le GeoJSON. Vérifiez ./data/actors_vbg_kolda.geojson");
  });
