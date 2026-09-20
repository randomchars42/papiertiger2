import { deSCTIDText } from "./textblocklib.js";
import * as uilib from "@lib/ui.js";
export const displayGroup = (id, parentID, level, title, sets, toggleGroup, resetGroup, toggleSet, text) => {
    const groupHTML = uilib.create("div", id);
    uilib.get(`${parentID}__body`).appendChild(groupHTML);
    const headerHTML = uilib.create("div", `${id}__header`);
    groupHTML.appendChild(headerHTML);
    const headingHTML = uilib.create(`h${level}`, `${id}__heading`);
    headerHTML.appendChild(headingHTML);
    headingHTML.textContent = title;
    headingHTML.addEventListener("click", toggleGroup);
    const setsHTML = uilib.create("div", `${id}__sets`);
    headerHTML.appendChild(setsHTML);
    const resetHTML = uilib.createButton({
        label: "button_reset",
        onClick: resetGroup,
    });
    setsHTML.appendChild(resetHTML);
    const setStates = {};
    for (const setID in sets) {
        const setHTML = uilib.createButton({
            id: `${id}${setID}`,
            label: sets[setID],
            onClick: toggleSet(setID),
        });
        setsHTML.appendChild(setHTML);
        setStates[setID] = false;
    }
    const bodyHTML = uilib.create("div", `${id}__body`);
    groupHTML.appendChild(bodyHTML);
    if (text !== undefined && text !== null) {
        const contentHTML = uilib.create("div", `${id}__content`);
        bodyHTML.appendChild(contentHTML);
        contentHTML.textContent = text;
    }
};
export const updateGroup = (groupID, state, sets = {}) => {
    if (state === "inactive") {
        uilib.get(`${groupID}__body`).classList.add("hidden");
        uilib.get(`${groupID}__heading`).classList.add("inactive");
        uilib.get(`${groupID}__sets`).classList.add("hidden");
    }
    else if (state === "default") {
        uilib.get(`${groupID}__body`).classList.remove("hidden");
        uilib.get(`${groupID}__heading`).classList.remove("inactive");
        uilib.get(`${groupID}__sets`).classList.remove("hidden");
        for (const id in sets) {
            if (sets[id]) {
                uilib.get(`${groupID}${id}`).classList.add("set--active");
            }
            else {
                uilib.get(`${groupID}${id}`).classList.remove("set--active");
            }
        }
    }
    else {
        return;
    }
};
export const displayPhrase = (id, parentID, onClick) => {
    const phraseHTML = uilib.create("span", id);
    uilib.get(`${parentID}__body`).appendChild(phraseHTML);
    phraseHTML.addEventListener("click", onClick);
};
export const updatePhrase = (phraseID, newState, oldState, text = "") => {
    const phraseHTML = uilib.get(phraseID);
    phraseHTML.textContent = text;
    phraseHTML.classList.remove(oldState);
    phraseHTML.classList.add(newState);
};
export const displayPhraseMenu = (id, getValue, textblocks, deactivate, update, save) => {
    setTemporaryPhraseTextblockID("");
    const content = uilib.create("div", `${id}__menucontent`);
    const deleteButton = uilib.createButton({
        id: `${id}__deactivate`,
        label: "button_delete",
        onClick: deactivate,
    });
    content.appendChild(deleteButton);
    const contentInput = getPhraseMenuInput(id);
    contentInput.value = getValue(id);
    content.appendChild(contentInput);
    const textblockContainer = uilib.create("div");
    content.appendChild(textblockContainer);
    const list = uilib.create("ul");
    content.appendChild(list);
    for (const textblockID in textblocks) {
        const item = uilib.create("li");
        list.appendChild(item);
        item.appendChild(uilib.createButton({
            id: `${textblockID}`,
            label: `${deSCTIDText(textblocks[textblockID])}⏎`,
            onClick: update(textblockID),
        }));
        item.appendChild(uilib.createButton({
            id: `${textblockID}`,
            label: "⮥",
            onClick: () => {
                clearPhraseMenuInput(id);
                insertIntoPhraseMenuInput(id, deSCTIDText(textblocks[textblockID]));
                setTemporaryPhraseTextblockID(textblockID);
            },
        }));
    }
    uilib.showModal(`${id}__modal`, content, uilib.createOkCancelButtons(() => {
        save(id, "modified", getTemporaryPhraseTextblockID(), getPhraseMenuInput(id).value);
        return true;
    }, () => {
        return true;
    }));
};
let temporaryPhraseTextblockID = "";
const getTemporaryPhraseTextblockID = () => {
    return temporaryPhraseTextblockID;
};
const setTemporaryPhraseTextblockID = (textblockID) => {
    temporaryPhraseTextblockID = textblockID;
};
const getPhraseMenuInput = (phraseID) => {
    let input;
    try {
        input = uilib.get(`${phraseID}__menuinput`);
    }
    catch (error) {
        input = uilib.create("input", `${phraseID}__menuinput`);
    }
    return input;
};
export const insertIntoPhraseMenuInput = (phraseID, text) => {
    const contentInput = getPhraseMenuInput(phraseID);
    uilib.insertAtCursor(contentInput, text);
};
export const clearPhraseMenuInput = (phraseID) => {
    const contentInput = getPhraseMenuInput(phraseID);
    contentInput.value = "";
};
export const focusPhraseMenuInput = (phraseID) => {
    const contentInput = getPhraseMenuInput(phraseID);
    contentInput.focus();
};
