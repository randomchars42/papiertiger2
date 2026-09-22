import { getConfig } from "./config.js";

export type PluginMessage = {
    type: string;
    payload: unknown;
};

export type ToolStatus = {
    badge?: string;
    attention?: boolean;
};

export type Plugin = {
    init?: () => Promise<void>;
    display?: (
        parentID: string,
        params: Record<string, unknown>,
    ) => Promise<void>;
    getValue?: (id: string) => Promise<unknown>;
    getStructuredValue?: (id: string) => Promise<unknown>;
    receive?: (message: PluginMessage) => Promise<void> | void;
    getToolStatus?: (id: string) => Promise<ToolStatus>;
    dispose?: (parentID: string) => void;
};

const plugins = new Map<string, Promise<Plugin>>();

export const loadPlugin = async (name: string): Promise<Plugin> => {
    let request = plugins.get(name);
    if (request === undefined) {
        request = (async (): Promise<Plugin> => {
            const plugin: Plugin = await import(
                `../${getConfig("pluginURL")}/${name}/${name}.js`
            );
            if (plugin.init) await plugin.init();
            return plugin;
        })();
        plugins.set(name, request);
    }
    return request;
};
