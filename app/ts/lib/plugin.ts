import { getConfig } from "./config.js";

export type Plugin = {
    init?: () => Promise<void>;
    display?: (
        parentID: string,
        params: Record<string, unknown>,
    ) => Promise<void>;
    getValue?: (id: string) => Promise<unknown>;
    getStructuredValue?: (id: string) => Promise<unknown>;
};

export const loadPlugin = async (name: string): Promise<Plugin> => {
    const plugin: Plugin = await import(
        `../${getConfig("pluginURL")}/${name}/${name}.js`
    );

    if (plugin.init) {
        await plugin.init();
    }

    return plugin;
};
