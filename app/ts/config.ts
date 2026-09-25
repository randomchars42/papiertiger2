type Config = {
    dataURL: string;
    pluginURL: string;
    autoCompactSeconds: number;
    symptomLens: string;
};

const defaults: Config = {
    dataURL: "./data",
    pluginURL: "./plugins",
    autoCompactSeconds: 12,
    symptomLens: "rettungsdienst",
};

let configured: Config = { ...defaults };

export const configure = (): void => {
    configured = { ...defaults };
    const parameters = new URL(window.location.href).searchParams;
    for (const key of Object.keys(defaults) as Array<keyof Config>) {
        const value = parameters.get(key);
        if (value === null) continue;
        const fallback = defaults[key];
        if (typeof fallback === "number") {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) {
                throw new Error(`Value "${value}" is not valid for "${key}"`);
            }
            (configured[key] as number) = parsed;
        } else if (value !== "") {
            (configured[key] as string) = value;
        }
    }
};

export const getConfig = <K extends keyof Config>(key: K): Config[K] =>
    configured[key];
