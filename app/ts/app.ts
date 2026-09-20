import * as config from "./config.js";
import { initialiseConfig } from "@lib/config.js";
import { loadPlugin } from "@lib/plugin.js";

const showError = (error: unknown): void => {
    console.error(error);
    const parent = document.getElementById("Editor__body");
    if (parent === null) return;
    const message = document.createElement("p");
    message.className = "error";
    message.textContent =
        error instanceof Error
            ? error.message
            : "Die Anwendung konnte nicht geladen werden.";
    parent.replaceChildren(message);
};

const run = async (): Promise<void> => {
    config.configure();
    initialiseConfig();

    const textblock = await loadPlugin("textblock");
    if (textblock.display === undefined) {
        throw new Error("Das Textbaustein-Modul konnte nicht geladen werden.");
    }
    await textblock.display("Editor__body", { id: "start" });
};

void run().catch(showError);
