import * as config from "./config.js";
import { initialiseConfig, getConfig } from "@lib/config.js";
import { loadPlugin, Plugin } from "@lib/plugin.js";
import * as uilib from "@lib/ui.js";

const run = async (): Promise<void> => {
    console.log("Hello World!");
    config.configure();

    initialiseConfig();

    console.log(getConfig("language"));

    const textblock: Plugin = await loadPlugin("textblock");
    if (textblock.display) {
        textblock.display("Editor", { id: "start" });
    }

    const button: HTMLButtonElement = uilib.createButton({
        label: "get",
        onClick: async () => {
            if (textblock.getValue) {
                const text: string = await textblock.getValue("start");
                console.log(text);
            }
        },
    });
    uilib.get("Editor__body").appendChild(button);

    const cedis: Plugin = await loadPlugin("cedis");
};

/*
const insertLineBreak = (event: Event): boolean => {
    const selection: Selection|null = window.getSelection();
    console.log('trying to break')

    if (!(event instanceof KeyboardEvent) ||  !selection || !(event.keyCode === 13)) {
        return true;
    }
    event.preventDefault();

    const range: Range = selection.getRangeAt(0);
    const br = document.createElement('br');
    const textNode = document.createTextNode('\u00a0');

    range.deleteContents();//required or not?
    range.insertNode(br);
    range.collapse(false);
    range.insertNode(textNode);
    range.selectNodeContents(textNode);

    selection.removeAllRanges();
    selection.addRange(range);
    return false;
}*/

run();
