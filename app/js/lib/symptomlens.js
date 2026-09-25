import { loadJSON } from "./base.js";
import { getConfig } from "../config.js";
let lenses = [];
let activeLens = "";
const isLens = (value) => typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "label" in value &&
    typeof value.id === "string" &&
    typeof value.label === "string";
export const initialiseSymptomLenses = async () => {
    const value = await loadJSON(`${getConfig("dataURL").replace(/\/$/, "")}/symptome.json`);
    if (typeof value !== "object" ||
        value === null ||
        !("catalogs" in value) ||
        typeof value.catalogs !== "object" ||
        value.catalogs === null ||
        !("symptome" in value.catalogs) ||
        typeof value.catalogs.symptome !== "object" ||
        value.catalogs.symptome === null ||
        !("lenses" in value.catalogs.symptome) ||
        !Array.isArray(value.catalogs.symptome.lenses) ||
        !value.catalogs.symptome.lenses.every(isLens)) {
        throw new Error("Die Symptomlinsen sind ungültig.");
    }
    lenses = value.catalogs.symptome.lenses;
    const configured = getConfig("symptomLens");
    activeLens = lenses.some((lens) => lens.id === configured)
        ? configured
        : (lenses[0]?.id ?? "");
};
export const symptomLenses = () => lenses;
export const getSymptomLens = () => activeLens;
export const setSymptomLens = (id, updateURL = true) => {
    if (id === activeLens || !lenses.some((lens) => lens.id === id))
        return;
    activeLens = id;
    if (updateURL) {
        const url = new URL(window.location.href);
        url.searchParams.set("symptomLens", id);
        window.history.replaceState(null, "", url);
    }
    document.dispatchEvent(new CustomEvent("papiertiger:symptom-lens-change", { detail: { id } }));
};
