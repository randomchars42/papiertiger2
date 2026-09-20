import * as config from "./config.js";
import { initialiseConfig, getConfig } from "@lib/config.js";
import { loadPlugin } from "@lib/plugin.js";
import * as uilib from "@lib/ui.js";
const run = async () => {
    console.log("Hello World!");
    config.configure();
    initialiseConfig();
    console.log(getConfig("language"));
    const textblock = await loadPlugin("textblock");
    if (textblock.display) {
        textblock.display("Editor", { id: "start" });
    }
    const button = uilib.createButton({
        label: "get",
        onClick: async () => {
            if (textblock.getValue) {
                const text = await textblock.getValue("start");
                console.log(text);
            }
        },
    });
    uilib.get("Editor__body").appendChild(button);
    const cedis = await loadPlugin("cedis");
};
run();
