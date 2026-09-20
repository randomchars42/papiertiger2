import { deSCTIDText } from "./textblocklib.js";
import type {
    Group,
    GroupState,
    Phrase,
    PhraseState,
} from "./textblocktypes.js";
import * as uilib from "@lib/ui.js";

export const displayGroup = (
    id: string,
    parentID: string,
    level: 1 | 2 | 3 | 4 | 5 | 6,
    title: string,
    sets: Group["sets"],
    toggleGroup: () => void,
    resetGroup: () => void,
    toggleSet: (setID: string) => () => void,
    text?: string,
): void => {
    const groupHTML: HTMLDivElement = uilib.create("div", id);
    uilib.get(`${parentID}__body`).appendChild(groupHTML);

    const headerHTML: HTMLDivElement = uilib.create("div", `${id}__header`);
    groupHTML.appendChild(headerHTML);

    const headingHTML: HTMLHeadingElement = uilib.create(
        `h${level}`,
        `${id}__heading`,
    );
    headerHTML.appendChild(headingHTML);
    headingHTML.textContent = title;
    headingHTML.addEventListener("click", toggleGroup);

    const setsHTML: HTMLDivElement = uilib.create("div", `${id}__sets`);
    headerHTML.appendChild(setsHTML);

    const resetHTML: HTMLButtonElement = uilib.createButton({
        label: "button_reset",
        onClick: resetGroup,
    });
    setsHTML.appendChild(resetHTML);

    const setStates: GroupState["sets"] = {};

    for (const setID in sets) {
        const setHTML: HTMLButtonElement = uilib.createButton({
            id: `${id}${setID}`,
            label: sets[setID],
            onClick: toggleSet(setID),
        });
        setsHTML.appendChild(setHTML);
        setStates[setID] = false;
    }

    const bodyHTML: HTMLDivElement = uilib.create("div", `${id}__body`);
    groupHTML.appendChild(bodyHTML);

    if (text !== undefined && text !== null) {
        const contentHTML: HTMLDivElement = uilib.create(
            "div",
            `${id}__content`,
        );
        bodyHTML.appendChild(contentHTML);
        contentHTML.textContent = text;
    }
};

export const updateGroup = (
    groupID: string,
    state: GroupState["state"],
    sets: GroupState["sets"] = {},
): void => {
    if (state === "inactive") {
        uilib.get(`${groupID}__body`).classList.add("hidden");
        uilib.get(`${groupID}__heading`).classList.add("inactive");
        uilib.get(`${groupID}__sets`).classList.add("hidden");
    } else if (state === "default") {
        uilib.get(`${groupID}__body`).classList.remove("hidden");
        uilib.get(`${groupID}__heading`).classList.remove("inactive");
        uilib.get(`${groupID}__sets`).classList.remove("hidden");

        for (const id in sets) {
            if (sets[id]) {
                uilib.get(`${groupID}${id}`).classList.add("set--active");
            } else {
                uilib.get(`${groupID}${id}`).classList.remove("set--active");
            }
        }
    } else {
        return;
    }
};

export const displayPhrase = (
    id: string,
    parentID: string,
    onClick: () => void,
): void => {
    const phraseHTML: HTMLSpanElement = uilib.create("span", id);
    uilib.get(`${parentID}__body`).appendChild(phraseHTML);

    phraseHTML.addEventListener("click", onClick);
};

export const updatePhrase = (
    phraseID: string,
    newState: PhraseState["state"],
    oldState: PhraseState["state"],
    text: string = "",
): void => {
    const phraseHTML: HTMLSpanElement = uilib.get(phraseID);

    phraseHTML.textContent = text;

    phraseHTML.classList.remove(oldState);
    phraseHTML.classList.add(newState);
};

export const displayPhraseMenu = (
    id: string,
    getValue: (id: string) => string,
    textblocks: Phrase["textblocks"],
    attributes: Phrase["attributes"],
    deactivate: () => void,
    update: (textblockID: string) => () => void,
    save: (
        id: string,
        state: PhraseState["state"],
        textBlockID: string,
        value: string,
    ) => void,
): void => {
    setTemporaryPhraseTextblockID("");
    const content: HTMLDivElement = uilib.create("div", `${id}__menucontent`);

    const deleteButton: HTMLButtonElement = uilib.createButton({
        id: `${id}__deactivate`,
        label: "button_delete",
        onClick: deactivate,
    });

    content.appendChild(deleteButton);

    const contentInput: HTMLInputElement = getPhraseMenuInput(id);
    contentInput.value = getValue(id);

    content.appendChild(contentInput);

    const textblockContainer: HTMLDivElement = uilib.create("div");

    content.appendChild(textblockContainer);

    const list: HTMLUListElement = uilib.create("ul");
    content.appendChild(list);

    for (const textblockID in textblocks) {
        const item: HTMLLIElement = uilib.create("li");
        list.appendChild(item);

        item.appendChild(
            uilib.createButton({
                id: `${textblockID}`,
                label: `${deSCTIDText(textblocks[textblockID])}⏎`,
                onClick: update(textblockID),
            }),
        );

        item.appendChild(
            uilib.createButton({
                id: `${textblockID}`,
                label: "⮥",
                onClick: (): void => {
                    clearPhraseMenuInput(id);
                    insertIntoPhraseMenuInput(
                        id,
                        deSCTIDText(textblocks[textblockID]),
                    );
                    setTemporaryPhraseTextblockID(textblockID);
                },
            }),
        );
    }

    const attributeList: HTMLUListElement = uilib.create("ul");
    content.appendChild(attributeList);

    for (const attributeID in attributes) {
        const item: HTMLLIElement = uilib.create("li");
        attributeList.appendChild(item);

        item.appendChild(
            uilib.createButton({
                id: `${attributeID}`,
                label: `${deSCTIDText(attributes[attributeID])}⮥`,
                onClick: (): void => {
                    insertIntoPhraseMenuInput(
                        id,
                        deSCTIDText(attributes[attributeID]),
                    );
                    setTemporaryPhraseTextblockID(attributeID);
                },
            }),
        );
    }

    uilib.showModal(
        `${id}__modal`,
        content,
        uilib.createOkCancelButtons(
            (): boolean => {
                save(
                    id,
                    "modified",
                    getTemporaryPhraseTextblockID(),
                    getPhraseMenuInput(id).value,
                );
                return true;
            },
            (): boolean => {
                return true;
            },
        ),
    );
};

let temporaryPhraseTextblockID: string = "";

const getTemporaryPhraseTextblockID = (): string => {
    return temporaryPhraseTextblockID;
};

const setTemporaryPhraseTextblockID = (textblockID: string): void => {
    temporaryPhraseTextblockID = textblockID;
};

const getPhraseMenuInput = (phraseID: string): HTMLInputElement => {
    let input: HTMLInputElement;

    try {
        input = uilib.get(`${phraseID}__menuinput`) as HTMLInputElement;
    } catch (error) {
        input = uilib.create("input", `${phraseID}__menuinput`);
    }

    return input;
};

export const insertIntoPhraseMenuInput = (
    phraseID: string,
    text: string,
): void => {
    const contentInput: HTMLInputElement = getPhraseMenuInput(phraseID);
    uilib.insertAtCursor(contentInput, text);
};

export const clearPhraseMenuInput = (phraseID: string): void => {
    const contentInput: HTMLInputElement = getPhraseMenuInput(phraseID);
    contentInput.value = "";
};

export const focusPhraseMenuInput = (phraseID: string): void => {
    const contentInput: HTMLInputElement = getPhraseMenuInput(phraseID);
    contentInput.focus();
};
