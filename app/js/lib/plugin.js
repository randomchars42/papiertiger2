import { getConfig } from "./config.js";
export const loadPlugin = async (name) => {
    const plugin = await import(`../${getConfig("pluginURL")}/${name}/${name}.js`);
    if (plugin.init) {
        await plugin.init();
    }
    return plugin;
};
