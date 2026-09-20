import * as tr from "./translate.js";
export const get = (id) => {
    const element = document.getElementById(id);
    if (element === null) {
        throw new Error(`Could not find element with id "${id}"`);
    }
    return element;
};
export const apply = (selector, fn) => {
    for (const element of document.querySelectorAll(selector)) {
        fn(element);
    }
};
export const create = (tagName, id = null, classList = []) => {
    const element = document.createElement(tagName);
    if (id !== null) {
        element.id = id;
    }
    element.classList.add(...classList);
    return element;
};
const isButton = (button) => {
    if ("id" in button && !(typeof button.id === "string")) {
        console.error(`"id" is not a string in button "${button}"`);
        return false;
    }
    if (!("label" in button)) {
        console.error(`"label" missing in button "${button}"`);
        return false;
    }
    if (!(typeof button.label === "string")) {
        console.error(`"label" is not a string in button "${button}"`);
        return false;
    }
    if (!("onClick" in button)) {
        console.error(`"onClick" missing in button "${button}"`);
        return false;
    }
    if (!(typeof button.onClick === "function")) {
        console.error(`"onClick" is not a function in button "${button}"`);
        return false;
    }
    if ("classList" in button &&
        !(Array.isArray(button.classList) &&
            button.classList.every((item) => typeof item === "string"))) {
        console.error(`"classList" is not an array of strings in button "${button}"`);
        return false;
    }
    return true;
};
export const createButton = (button) => {
    if (!isButton(button)) {
        throw Error(`Invalid button "${button}"`);
    }
    const newButton = create("button", button?.id, button.classList);
    newButton.textContent = button.label;
    tr.tr(button.label).then((text) => {
        newButton.textContent = text;
    });
    newButton.addEventListener("click", (event) => {
        button.onClick(event);
        event.preventDefault();
        event.stopPropagation();
    });
    return newButton;
};
const appendButtonsTo = (parent, buttons) => {
    const buttonElements = [];
    for (const button of buttons) {
        const newButton = createButton(button);
        parent.append(newButton);
        buttonElements.push(newButton);
    }
    return buttonElements;
};
export const generateCSSCompatibleString = (string) => {
    let returnString = string.toLowerCase();
    returnString = returnString.replace(/[^a-zA-Z0-9_\-]/g, "");
    returnString = returnString.replace(/[\s_\-]+/g, "");
    returnString = returnString.replace(/[\s_]+/g, "-");
    return returnString;
};
export const generateRandomID = (length = 6) => {
    let result = "";
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return result;
};
export const insertAtCursor = (input, text) => {
    const value = input.value;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    input.value = value.slice(0, start) + text + value.slice(end);
    input.selectionStart = input.selectionEnd = start + text.length;
};
export const deleteAtCursor = (input) => {
    const value = input.value;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    input.value = value.slice(0, start - 1) + value.slice(end);
    input.selectionStart = input.selectionEnd = start - 1;
};
export const showModal = async (id, content, buttonsBottom = [], buttonsTop = [], onBackgroundClick = () => {
    return true;
}) => {
    const background = create("div", `${id}Background`, ["modal_background"]);
    const window = create("div", `${id}Window`, ["modal_window"]);
    background.append(window);
    const bottomBar = create("div", null, [
        "pane",
        "modal_bar",
        "modal_bar_bottom",
    ]);
    for (const button of buttonsBottom) {
        const onClick = button.onClick;
        button.onClick = (event) => {
            if (onClick(event)) {
                hideModal(id);
                return true;
            }
            return false;
        };
    }
    appendButtonsTo(bottomBar, buttonsBottom);
    const topBar = create("div", null, [
        "pane",
        "modal_bar",
        "modal_bar_top",
    ]);
    appendButtonsTo(topBar, buttonsTop);
    const canvas = create("div", id, ["modal_content"]);
    canvas.append(content);
    window.append(topBar, canvas, bottomBar);
    document.body.append(background);
    background.addEventListener("click", (event) => {
        if (onBackgroundClick(id)) {
            hideModal(id);
        }
        event.stopPropagation();
    });
    canvas.addEventListener("click", (event) => {
        event.stopPropagation();
    });
};
export const hideModal = (id) => {
    get(`${id}Background`).remove();
};
export const showDialog = async (id, content, buttons = [], onBackgroundClick = () => {
    return false;
}) => {
    const text = await tr.tr(content);
    if (buttons.length === 0) {
        buttons.push({
            label: "button_ok",
            onClick: () => {
                return true;
            },
            classList: ["item_ref"],
        });
    }
    await showModal(id, text, buttons, [], onBackgroundClick);
};
export const showInfo = async (id, content) => {
    await showDialog(id, content);
};
export const createOkCancelButtons = (onConfirm, onCancel) => {
    const ok = {
        label: "button_ok",
        onClick: onConfirm,
        classList: ["item_ref"],
    };
    const cancel = {
        label: "button_cancel",
        onClick: onCancel
            ? onCancel
            : () => {
                return true;
            },
        classList: ["item_pat"],
    };
    return [ok, cancel];
};
export const confirm = async (id, content, onConfirm, onCancel) => {
    await showDialog(id, content, createOkCancelButtons(onConfirm, onCancel), onCancel);
};
