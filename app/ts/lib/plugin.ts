import { getConfig } from "./config.js";

export type Plugin = {
    init?: () => Promise<void>;
    display?: (parentID: string, params: Record<string, any>) => Promise<void>;
    getValue?: (id: string) => Promise<any>;
};

export const loadPlugin = async (name: string): Promise<Plugin> => {
    const plugin: Plugin = await import(
        `../${getConfig("pluginURL")}/${name}/${name}.js`
    );

    if (plugin.init) {
        plugin.init();
    }

    return plugin;
};
