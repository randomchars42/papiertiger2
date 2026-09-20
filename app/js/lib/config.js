const config = { url: {}, environments: {} };
let env = "test";
export const configure = (env, values) => {
    config.environments[env] ??= {};
    Object.assign(config.environments[env], values);
};
export const initialiseConfig = () => {
    const parsedURL = new URL(window.location.href);
    if (parsedURL.searchParams.has("env")) {
        env = parsedURL.searchParams.get("env") ?? env;
        console.log(`Setting env to "${env}" based on URL parameter`);
    }
    if (config.environments[env] === undefined) {
        throw new Error(`Environment "${env}" not configured`);
    }
    const envConfig = config.environments[env];
    for (const [key, value] of parsedURL.searchParams) {
        if (key === "env") {
            continue;
        }
        if (envConfig !== undefined && key in envConfig) {
            const entry = envConfig[key];
            if (typeof entry === "string" && value !== "") {
                envConfig[key] = value;
                continue;
            }
            const numberValue = Number(value);
            if ((typeof entry === "number" && !isNaN(numberValue)) ||
                (typeof entry === "boolean" && numberValue in [0, 1])) {
                envConfig[key] = numberValue;
                continue;
            }
            throw new Error(`Value "${value}" not valid for config of ` +
                `"${key}" in env "${env}"`);
        }
        else if ("url" in config && config["url"]) {
            config["url"][key] = value;
        }
    }
};
export const getConfig = (key) => {
    if (config.environments[env] === undefined) {
        throw new Error(`Environment "${env}" not initialised`);
    }
    const value = config.environments[env][key];
    if (value === undefined) {
        throw new Error(`Missing configuration key "${String(key)}" ` + `in env "${env}"`);
    }
    return value;
};
