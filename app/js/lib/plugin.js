import { getConfig } from "../config.js";
const plugins = new Map();
export const loadPlugin = async (name) => {
    let request = plugins.get(name);
    if (request === undefined) {
        request = (async () => {
            const plugin = await import(`../${getConfig("pluginURL")}/${name}/${name}.js`);
            if (plugin.init)
                await plugin.init();
            return plugin;
        })();
        plugins.set(name, request);
    }
    return request;
};
