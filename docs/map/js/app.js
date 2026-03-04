/* =========================================================
   Leaflet map — Acteurs VBG Kolda
   - Charge GeoJSON
   - Symbologie par type d’acteur
   - Popups (structure, services, contacts)
   ========================================================= */

const MAP_DEFAULT = {
  center: [12.9, -14.95], // Kolda approx (à ajuster si besoin)
  zoom: 9
};

const GEOJSON_URL = "./data/actors_vbg_kolda.geojson";

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
  // split by ; or , for tags
  return v.split(/[;,]/).map(x => x.trim()).filter(Boolean);
}

function makePopup(props){
  const name = escHtml(safe(props.structure) || "Structure (non renseigné)");
  const type = escHtml(safe(props.actor_type));
  const services = escHtml(safe(props.service_domains));
  const gbvTypes = splitTags(props.service_gbv_type).map(t => `<span class="tag">${escHtml(t)}</span>`).join(" ");
  const targets = escHtml(safe(props.target_groups));
  const coverage = escHtml(safe(props.coverage_level));
  const depts = escHtml(safe(props["departement(s)"]));
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

function markerStyle(props){
  const t = safe(props.actor_type).toLowerCase();
  if (t.includes("service") || t.includes("étatique") || t.includes("etat") || t.includes("state")){
    // Blue circle
    return {
      type: "circle",
      radius: 6,
      fillColor: "#1f5fa8",
      color: "#ffffff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    };
  }
  // Black triangle via DivIcon (Leaflet doesn't have triangle circleMarker)
  return { type: "triangle" };
}

function triangleIcon(){
  // Simple CSS triangle marker
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

// Init map
const map = L.map("map", { zoomControl: true }).setView(MAP_DEFAULT.center, MAP_DEFAULT.zoom);

// Basemap (OpenStreetMap)
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Layers holders
let layerState = null;
let layerOSC = null;
let allBounds = null;

function fitToData(){
  if (allBounds && allBounds.isValid()){
    map.fitBounds(allBounds.pad(0.15));
  }
}

// Load data
fetch(GEOJSON_URL)
  .then(r => {
    if (!r.ok) throw new Error(`GeoJSON introuvable: ${GEOJSON_URL}`);
    return r.json();
  })
  .then(geo => {
    // Split features by actor_type
    const features = geo.features || [];
    const stateFeatures = [];
    const oscFeatures = [];

    features.forEach(f => {
      const p = (f && f.properties) ? f.properties : {};
      const t = safe(p.actor_type).toLowerCase();
      if (t.includes("service") || t.includes("étatique") || t.includes("etat") || t.includes("state")){
        stateFeatures.push(f);
      } else {
        oscFeatures.push(f);
      }
    });

    function makeLayer(featureList){
      return L.geoJSON(featureList, {
        pointToLayer: (feature, latlng) => {
          const props = feature.properties || {};
          const st = markerStyle(props);
          if (st.type === "circle"){
            return L.circleMarker(latlng, st);
          }
          return L.marker(latlng, { icon: triangleIcon() });
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          layer.bindPopup(makePopup(props), { maxWidth: 360 });
        }
      });
    }

    layerState = makeLayer(stateFeatures).addTo(map);
    layerOSC = makeLayer(oscFeatures).addTo(map);

    // Bounds
    const group = L.featureGroup([layerState, layerOSC]);
    allBounds = group.getBounds();
    fitToData();
  })
  .catch(err => {
    console.error(err);
    alert("Erreur: impossible de charger le GeoJSON. Vérifiez le chemin ./data/actors_vbg_kolda.geojson");
  });

// UI controls
document.getElementById("btn-fit").addEventListener("click", fitToData);

document.getElementById("btn-toggle-state").addEventListener("click", () => {
  if (!layerState) return;
  if (map.hasLayer(layerState)) map.removeLayer(layerState);
  else map.addLayer(layerState);
});

document.getElementById("btn-toggle-osc").addEventListener("click", () => {
  if (!layerOSC) return;
  if (map.hasLayer(layerOSC)) map.removeLayer(layerOSC);
  else map.addLayer(layerOSC);
});
