import { getConfig } from "../config.js";

export type Lens = {
    id: string;
    label: string;
};

let lenses: Lens[] = [];
let activeLens = "";

export const initialiseLenses = (
    definitions: readonly Lens[],
    defaultLens: string,
): void => {
    lenses = definitions.map((lens) => ({ ...lens }));
    const configured = getConfig("lens");
    activeLens = lenses.some((lens) => lens.id === configured)
        ? configured
        : defaultLens;
};

export const availableLenses = (): readonly Lens[] => lenses;

export const getLens = (): string => activeLens;

export const setLens = (id: string, updateURL = true): void => {
    if (id === activeLens || !lenses.some((lens) => lens.id === id)) return;
    activeLens = id;
    if (updateURL) {
        const url = new URL(window.location.href);
        url.searchParams.set("lens", id);
        window.history.replaceState(null, "", url);
    }
    document.dispatchEvent(
        new CustomEvent("papiertiger:lens-change", { detail: { id } }),
    );
};
