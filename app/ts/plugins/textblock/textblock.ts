import { deSCTIDText, getSCTIDFromText } from "./textblocklib.js";
import type {
    Stack,
    StackState,
    Item,
    Group,
    GroupState,
    Phrase,
    PhraseState,
} from "./textblocktypes.js";
import * as baselib from "@lib/base.js";
import { getConfig } from "@lib/config.js";
import * as rulehub from "../../rulehub.js";
import * as textblockui from "./textblockui.js";
import * as uilib from "@lib/ui.js";

export const display = async (
    parentID: string,
    params: Record<string, any>,
): Promise<void> => {
    loadGroup(params.id, parentID, params.level ?? 1);
};

export const getValue = async (id: string): Promise<string> => {
    return (await getGroupValue(id)) + "\n\n\n" + (await getGroupSCTIDs(id));
};

const stack: Stack = {
    groups: {},
    phrases: {},
};

const states: StackState = {
    groups: {},
    phrases: {},
};

const isItem = (item: Item): boolean => {
    if (!("id" in item)) {
        console.error(`"id" missing in item "${item["title"]}"`);
        return false;
    }

    if (!(typeof item.id === "string")) {
        console.error(`"id" is not a string in item "${item["id"]}"`);
        return false;
    }

    if (!("title" in item)) {
        console.error(`"title" missing in item "${item["id"]}"`);
        return false;
    }

    if (!(typeof item.title === "string")) {
        console.error(`"title" is not a string in item "${item["id"]}"`);
        return false;
    }

    if (!("note" in item)) {
        console.error(`"note" missing in item "${item["id"]}"`);
        return false;
    }

    if (!(typeof item.note === "string")) {
        console.error(`"note" is not a string in item "${item["id"]}"`);
        return false;
    }

    return true;
};

const isGroup = (group: Group): boolean => {
    if (!isItem(group)) {
        return false;
    }

    if (!("children" in group)) {
        console.error(`"children" missing in group "${group["id"]}"`);
        return false;
    }

    if (
        !(
            Array.isArray(group.children) &&
            group.children.every((item) => typeof item === "string")
        )
    ) {
        console.error(
            `"children" is not an array of strings in group "${group["id"]}"`,
        );
        return false;
    }

    if ("content" in group && !(typeof group.content === "string")) {
        console.error(`"content" is not a string in group "${group["id"]}"`);
        return false;
    }

    if (!("phrases" in group)) {
        console.error(`"phrases" missing in group "${group["id"]}"`);
        return false;
    }

    if (
        !(
            Array.isArray(group.phrases) &&
            group.phrases.every((item) => typeof item === "string")
        )
    ) {
        console.error(
            `"phrases" is not an array of strings in group "${group["id"]}"`,
        );
        return false;
    }

    if (!("sets" in group)) {
        console.error(`"sets" missing in group "${group["id"]}"`);
        return false;
    }

    if (
        !(
            typeof group.sets === "object" &&
            !Array.isArray(group.sets) &&
            Object.values(group.sets).every(
                (value) => typeof value === "string",
            )
        )
    ) {
        console.error(
            `"sets" is not an dictionary of strings in group "${group["id"]}"`,
        );
        return false;
    }

    if (!("default" in group)) {
        console.error(`"default" missing in group "${group["id"]}"`);
        return false;
    }

    if (!["default", "inactive"].includes(group.default)) {
        console.error(`"default" is not valid in group "${group["id"]}"`);
        return false;
    }

    return true;
};

const isPhrase = (phrase: Phrase): boolean => {
    if (!isItem(phrase)) {
        return false;
    }

    if (!("default" in phrase)) {
        console.error(`"default" missing in phrase "${phrase["id"]}"`);
        return false;
    }

    if (!(typeof phrase.default === "string")) {
        console.error(`"default" is not a string in phrase "${phrase["id"]}"`);
        return false;
    }

    if (!("textblocks" in phrase)) {
        console.error(`"textblocks" missing in phrase "${phrase["id"]}"`);
        return false;
    }

    if (
        !(
            typeof phrase.textblocks === "object" &&
            Object.values(phrase.textblocks).every(
                (value) => typeof value === "string",
            )
        )
    ) {
        console.error(
            `"textblocks" is not a dictionary of strings in phrase "${phrase["id"]}"`,
        );
        return false;
    }

    if (!("suggestions" in phrase)) {
        console.error(`"suggestions" missing in phrase "${phrase["id"]}"`);
        return false;
    }

    if (
        !(
            typeof phrase.suggestions === "object" &&
            Object.values(phrase.suggestions).every(
                (value) => typeof value === "string",
            )
        )
    ) {
        console.error(
            `"suggestions" is not a dictionary of strings in phrase "${phrase["id"]}"`,
        );
        return false;
    }

    if (!("setRules" in phrase)) {
        console.error(`"setRules" missing in phrase "${phrase["id"]}"`);
        return false;
    }

    if (
        !(
            typeof phrase.setRules === "object" &&
            Object.values(phrase.setRules).every(
                (value) => typeof value === "string",
            )
        )
    ) {
        console.error(
            `"setRules" is not a dictionary of strings in phrase "${phrase["id"]}"`,
        );
        return false;
    }

    if (!("attributes" in phrase)) {
        console.error(`"attributes" missing in phrase "${phrase["id"]}"`);
        return false;
    }

    if (
        !(
            typeof phrase.attributes === "object" &&
            Object.values(phrase.attributes).every(
                (value) => typeof value === "string",
            )
        )
    ) {
        console.error(
            `"attributes" is not a dictionary of strings in phrase "${phrase["id"]}"`,
        );
        return false;
    }

    return true;
};

const isPackage = (stack: Stack): boolean => {
    if (!("groups" in stack)) {
        console.error(`no groups in stack ${stack["id"]}`);
        return false;
    }

    if (!("phrases" in stack)) {
        console.error(`no phrases in stack ${stack["id"]}`);
        return false;
    }

    for (const id in stack.groups) {
        if (!isGroup(stack.groups[id])) {
            return false;
        }
    }

    for (const id in stack.phrases) {
        if (!isPhrase(stack.phrases[id])) {
            return false;
        }
    }
    return true;
};

const fetchPackage = async (id: string): Promise<void> => {
    const data: any = await baselib.load(
        `${getConfig("dataURL")}/${id}.json`,
        "json",
    );

    if (!isPackage(data)) {
        throw Error(`recieved data for id "${id}" was not a package`);
    }

    for (const id in data.groups) {
        stack.groups[id] = data.groups[id];
    }

    for (const id in data.phrases) {
        stack.phrases[id] = data.phrases[id];
    }
};

const getGroup = async (id: string): Promise<Group> => {
    if (!(id in stack.groups)) {
        console.log(`group "${id}" is not in the stack -> need to fetch it`);
        await fetchPackage(id);
    }

    return stack.groups[id];
};

const getGroupState = (id: string): GroupState => {
    if (!(id in states.groups)) {
        states.groups[id] = {
            id: id,
            state: "default",
            value: "",
            sets: {},
        };
    }

    return states.groups[id];
};

const getPhrase = async (id: string): Promise<Phrase> => {
    if (!(id in stack.phrases)) {
        console.log(`phrase "${id}" is not in the stack -> need to fetch it`);
        await fetchPackage(id);
    }

    return stack.phrases[id];
};

const getDefaultPhraseState = (
    id: string,
    state: PhraseState["state"] = "default",
): PhraseState => {
    return {
        id: id,
        state: state,
        textblock: "",
        value: "",
    };
};

const getPhraseState = (id: string): PhraseState => {
    if (!(id in states.phrases)) {
        states.phrases[id] = getDefaultPhraseState(id);
    }

    return states.phrases[id];
};

const nextLevel = (level: number): 1 | 2 | 3 | 4 | 5 | 6 => {
    if (level < 1) {
        return 1;
    } else if (level < 2) {
        return 2;
    } else if (level < 3) {
        return 3;
    } else if (level < 4) {
        return 4;
    } else if (level < 5) {
        return 5;
    } else {
        return 6;
    }
};

const toggleGroup = async (id: string): Promise<void> => {
    const newState: GroupState = { ...getGroupState(id) };

    if (newState.state === "default") {
        newState.state = "inactive";
    } else {
        newState.state = "default";
    }

    await updateGroup(id, newState.state);
};

const toggleSet = async (groupID: string, setID: string): Promise<void> => {
    const newState: GroupState = { ...getGroupState(groupID) };

    if (newState.sets[setID]) {
        newState.sets[setID] = false;
        rulehub.deactivate("set", setID);
    } else {
        newState.sets[setID] = true;
        rulehub.activate("set", setID);
    }

    await updateGroup(groupID, newState.state, newState.sets);
};

const updateGroup = async (
    groupID: string,
    newState: GroupState["state"],
    sets: GroupState["sets"] = {},
): Promise<void> => {
    const state: GroupState = getGroupState(groupID);
    const group: Group = await getGroup(groupID);

    if (newState === "inactive") {
        state.value = "";
    } else if (newState === "default") {
        state.value = deSCTIDText(group.title);
    } else {
        return;
    }

    state.state = newState;
    textblockui.updateGroup(groupID, newState, sets);
};

const loadGroup = async (
    id: string,
    parentID: string,
    level: 1 | 2 | 3 | 4 | 5 | 6,
): Promise<void> => {
    const group: Group = await getGroup(id);

    textblockui.displayGroup(
        id,
        parentID,
        level,
        deSCTIDText(group.title),
        group.sets,
        (): void => {
            toggleGroup(id);
        },
        (): void => {
            resetGroup(id);
        },
        (setID: string): (() => void) => {
            return () => {
                toggleSet(id, setID);
            };
        },
        group.content,
    );

    const setStates: GroupState["sets"] = {};

    for (const setID in group.sets) {
        setStates[setID] = false;
    }

    if (group.children.length > 0) {
        for (const child of group.children) {
            loadGroup(child, id, nextLevel(level));
        }
    } else if (group.phrases.length > 0) {
        for (const phrase of group.phrases) {
            loadPhrase(phrase, id);
        }
    }

    updateGroup(id, group.default, setStates);
};

const resetGroup = async (id: string): Promise<void> => {
    const group: Group = await getGroup(id);
    const state: GroupState = getGroupState(id);

    for (const setID in state.sets) {
        state.sets[setID] = false;
    }

    await updateGroup(id, "default", { ...state.sets });

    if (group.children.length > 0) {
        for (const child of group.children) {
            resetGroup(child);
        }
    } else if (group.phrases.length > 0) {
        for (const child of group.phrases) {
            resetPhrase(child);
        }
    }
};

const getGroupValue = async (id: string): Promise<string> => {
    const group: Group = await getGroup(id);
    const state: GroupState = getGroupState(id);
    let value: string = "";

    if (state.state === "inactive") {
        return "";
    }

    if (group.children.length > 0) {
        for (const child of group.children) {
            const text: string = await getGroupValue(child);
            value += `\n\n${text}`;
        }
    } else if (group.phrases.length > 0) {
        value += ":";
        for (const child of group.phrases) {
            const text: string = await getPhraseValue(child);
            value += ` ${text};`;
        }
    }

    return `${state.value}${value}`;
};

const getGroupSCTIDs = async (id: string): Promise<string> => {
    const group: Group = await getGroup(id);
    const state: GroupState = getGroupState(id);
    let sctids: string = "";

    if (state.state === "inactive") {
        return "";
    }

    if (group.children.length > 0) {
        for (const child of group.children) {
            const text: string = await getGroupSCTIDs(child);
            sctids += `${text}`;
        }
    } else if (group.phrases.length > 0) {
        sctids += ":";
        for (const child of group.phrases) {
            const text: string = await getPhraseSCTIDs(child);
            sctids += ` ${text};`;
        }
    }

    return `${getSCTIDFromText(group.title)}${sctids}`;
};

const updatePhrase = async (
    phraseID: string,
    newState: PhraseState["state"],
    textblockID: string = "",
    value: string = "",
): Promise<void> => {
    const state: PhraseState = getPhraseState(phraseID);
    const phrase: Phrase = await getPhrase(phraseID);
    let text: string = "";

    if (
        newState === "inactive" ||
        (newState === "default" && phrase.default === "")
    ) {
        rulehub.deactivate("suggestion", state.textblock);
        state.value = "";
        state.textblock = "";
        text = phrase.title;
    } else if (newState === "default") {
        rulehub.deactivate("suggestion", state.textblock);
        rulehub.activate("suggestion", phrase.default);
        state.value = deSCTIDText(phrase.textblocks[phrase.default]);
        state.textblock = phrase.default;
        text = deSCTIDText(phrase.textblocks[phrase.default]);
    } else if (newState === "set" && state.state !== "modified") {
        rulehub.deactivate("suggestion", state.textblock);
        rulehub.activate("suggestion", textblockID);
        state.value = deSCTIDText(phrase.textblocks[textblockID]);
        state.textblock = textblockID;
        text = deSCTIDText(phrase.textblocks[textblockID]);
    } else if (newState === "suggested" && state.state !== "modified") {
        rulehub.deactivate("suggestion", state.textblock);
        rulehub.activate("suggestion", textblockID);
        state.value = deSCTIDText(phrase.textblocks[textblockID]);
        state.textblock = textblockID;
        text = deSCTIDText(phrase.textblocks[textblockID]);
    } else if (newState === "modified") {
        rulehub.deactivate("suggestion", state.textblock);
        rulehub.activate("suggestion", textblockID);
        state.value =
            value === "" ? deSCTIDText(phrase.textblocks[textblockID]) : value;
        state.textblock = textblockID;
        text =
            value === "" ? deSCTIDText(phrase.textblocks[textblockID]) : value;
    } else if (newState === "hidden") {
        rulehub.deactivate("suggestion", state.textblock);
        state.value = "";
        state.textblock = "";
        text = "";
    } else {
        return;
    }

    textblockui.updatePhrase(phraseID, newState, state.state, text);
    state.state = newState;
};

const resetPhrase = async (id: string): Promise<void> => {
    await updatePhrase(id, "default");
};

const getPhraseValue = async (id: string): Promise<string> => {
    const state: PhraseState = getPhraseState(id);

    return state.value;
};

const getPhraseSCTIDs = async (id: string): Promise<string> => {
    const state: PhraseState = getPhraseState(id);
    const phrase: Phrase = await getPhrase(id);
    let sctids: string = "";

    const parts: string[] = state.value.split(getConfig("phraseDelimiter"));

    for (const part of parts) {
        for (const id in phrase.textblocks) {
            const sctid: string = getSCTIDFromText(phrase.textblocks[id]);
            const text: string = deSCTIDText(phrase.textblocks[id]);

            if (part.indexOf(text) >= 0) {
                sctids += sctid;

                for (const attributeID in phrase.attributes) {
                    const attributeSCTID: string = getSCTIDFromText(
                        phrase.attributes[attributeID],
                    );
                    const attributeText: string = deSCTIDText(
                        phrase.attributes[attributeID],
                    );

                    if (part.indexOf(attributeText)) {
                        sctids += attributeSCTID;
                    }
                }
            }
        }
    }
    return sctids;
};

const onRule = async (
    type: rulehub.RuleType,
    phraseID: string,
    textblockID: string,
    signal: rulehub.Signal,
): Promise<void> => {
    if (signal === "activate") {
        if (type === "set") {
            updatePhrase(phraseID, "set", textblockID);
        } else if (type === "suggestion") {
            updatePhrase(phraseID, "suggested", textblockID);
        } else if (type === "guide") {
            updatePhrase(phraseID, "suggested", textblockID);
        }
    } else {
        if (type === "guide") {
            updatePhrase(phraseID, "hidden");
        } else {
            updatePhrase(phraseID, "default");
        }
    }
};

const loadPhrase = async (id: string, parentID: string): Promise<void> => {
    const phrase: Phrase = await getPhrase(id);
    const state: PhraseState = getDefaultPhraseState(id);

    textblockui.displayPhrase(id, parentID, () => {
        textblockui.displayPhraseMenu(
            id,
            (id: string): string => {
                return getPhraseState(id).value;
            },
            phrase.textblocks,
            phrase.attributes,
            () => {
                updatePhrase(id, "inactive");
                uilib.hideModal(`${id}__modal`);
            },
            (textblockID: string): (() => void) => {
                return () => {
                    updatePhrase(id, "modified", textblockID);
                    uilib.hideModal(`${id}__modal`);
                };
            },
            updatePhrase,
        );
    });

    updatePhrase(state.id, state.state, state.value, state.textblock);

    for (const foreignPhraseID in phrase.setRules) {
        rulehub.register("set", foreignPhraseID, {
            phraseID: id,
            textblockID: phrase.setRules[foreignPhraseID],
            callback: onRule,
        });
    }

    for (const foreignPhraseID in phrase.suggestions) {
        rulehub.register("suggestion", foreignPhraseID, {
            phraseID: id,
            textblockID: phrase.suggestions[foreignPhraseID],
            callback: onRule,
        });
    }
};
