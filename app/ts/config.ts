import * as config from "@lib/config.js";

declare module "@lib/config.js" {
    interface ConfigSchema {
        dataURL: string;
        phraseDelimiter: string;
    }
}

export const configure = (): void => {
    config.configure("test", {
        language: "de_AT",
        logLevel: "debug",
        baseURL: "./",
        dataURL: "./data",
        languageURL: "./language",
        pluginURL: "./plugins",
        phraseDelimiter: ";",
    });

    config.configure("production", {
        language: "de_DE",
        logLevel: "error",
        baseURL: "./",
        dataURL: "./data/",
        languageURL: "./language",
        pluginURL: "./plugins",
        phraseDelimiter: ";",
    });
};
