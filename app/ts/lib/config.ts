// biome-ignore lint/suspicious/noEmptyInterface: will be extended outside of this library
export interface ConfigSchema extends Record<string, any> {
    language: string;
    logLevel: string;
    baseURL: string;
    languageURL: string;
    pluginURL: string;
}

export type ConfigStorage = {
    url: Record<string, string>;
    environments: Record<string, Partial<ConfigSchema>>;
};

const config: ConfigStorage = { url: {}, environments: {} };
let env: string = "test";

export const configure = (env: string, values: ConfigSchema): void => {
    config.environments[env] ??= {};

    Object.assign(config.environments[env], values);
};

export const initialiseConfig = (): void => {
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

            if (
                (typeof entry === "number" && !isNaN(numberValue)) ||
                (typeof entry === "boolean" && numberValue in [0, 1])
            ) {
                envConfig[key] = numberValue;
                continue;
            }

            throw new Error(
                `Value "${value}" not valid for config of ` +
                    `"${key}" in env "${env}"`,
            );
        } else if ("url" in config && config["url"]) {
            config["url"][key] = value;
        }
    }
};

export const getConfig = <K extends keyof ConfigSchema>(
    key: K,
): ConfigSchema[K] => {
    if (config.environments[env] === undefined) {
        throw new Error(`Environment "${env}" not initialised`);
    }

    const value = config.environments[env][key];

    if (value === undefined) {
        throw new Error(
            `Missing configuration key "${String(key)}" ` + `in env "${env}"`,
        );
    }

    return value;
};
