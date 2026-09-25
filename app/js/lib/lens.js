import { getConfig } from "../config.js";
let lenses = [];
let activeLens = "";
export const initialiseLenses = (definitions, defaultLens) => {
    lenses = definitions.map((lens) => ({ ...lens }));
    const configured = getConfig("lens");
    activeLens = lenses.some((lens) => lens.id === configured)
        ? configured
        : defaultLens;
};
export const availableLenses = () => lenses;
export const getLens = () => activeLens;
export const setLens = (id, updateURL = true) => {
    if (id === activeLens || !lenses.some((lens) => lens.id === id))
        return;
    activeLens = id;
    if (updateURL) {
        const url = new URL(window.location.href);
        url.searchParams.set("lens", id);
        window.history.replaceState(null, "", url);
    }
    document.dispatchEvent(new CustomEvent("papiertiger:lens-change", { detail: { id } }));
};
