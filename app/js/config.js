const defaults = {
    dataURL: "./data",
    pluginURL: "./plugins",
    autoCompactSeconds: 12,
    symptomLens: "rettungsdienst",
};
let configured = { ...defaults };
export const configure = () => {
    configured = { ...defaults };
    const parameters = new URL(window.location.href).searchParams;
    for (const key of Object.keys(defaults)) {
        const value = parameters.get(key);
        if (value === null)
            continue;
        const fallback = defaults[key];
        if (typeof fallback === "number") {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) {
                throw new Error(`Value "${value}" is not valid for "${key}"`);
            }
            configured[key] = parsed;
        }
        else if (value !== "") {
            configured[key] = value;
        }
    }
};
export const getConfig = (key) => configured[key];
