import { element } from "@lib/dom.js";
const updates = [
    {
        id: "papiertiger2",
        date: "2026-09-22",
        title: "Von Papiertiger zu Papiertiger2",
        paragraphs: [
            "Papiertiger2 organisiert die Dokumentation in auswählbaren Dokumenten mit gemeinsamem Textbaustein-Zustand.",
            "Vorschläge bleiben sichtbar, werden aber weiterhin erst nach Ihrer Bestätigung in die Ausgabe aufgenommen.",
            "Neue Werkzeuge erscheinen in einer Seitenfläche, ohne den klinischen Dokumenttext selbst zu verändern.",
        ],
    },
];
const storageKey = "papiertiger2.updates.read.v1";
let memoryRead = new Set();
const readIds = () => {
    try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored === null)
            return new Set(memoryRead);
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed))
            return new Set(memoryRead);
        return new Set(parsed.filter((value) => typeof value === "string"));
    }
    catch {
        return new Set(memoryRead);
    }
};
const writeReadIds = (ids) => {
    memoryRead = new Set(ids);
    try {
        window.localStorage.setItem(storageKey, JSON.stringify([...ids]));
    }
    catch {
    }
};
const unreadEntries = () => {
    const read = readIds();
    return updates.filter((entry) => !read.has(entry.id));
};
export const getToolStatus = async () => {
    const unread = unreadEntries().length;
    return unread === 0
        ? {}
        : { badge: String(unread), attention: true };
};
export const display = async (parentId, _params) => {
    const parent = document.getElementById(parentId);
    if (parent === null)
        throw new Error(`Parent "${parentId}" was not found`);
    const documentNode = element("article", "document updates-module");
    for (const entry of updates) {
        const section = element("section", "updates-entry");
        const header = element("header", "updates-entry__header");
        header.append(element("h3", "group__heading", entry.title), element("time", "updates-entry__date", entry.date));
        section.append(header);
        for (const paragraph of entry.paragraphs) {
            section.append(element("p", "group__content", paragraph));
        }
        documentNode.append(section);
    }
    parent.replaceChildren(documentNode);
    const read = readIds();
    for (const entry of updates)
        read.add(entry.id);
    writeReadIds(read);
    parent.dispatchEvent(new CustomEvent("papiertiger:tool-status", { bubbles: true }));
};
