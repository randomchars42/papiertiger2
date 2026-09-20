import * as time from "./time.js";
import * as tr from "./translate.js";

/**
 *
 * Small functions for interacting with the DOM tree.
 *
 */

export const get = (id: string): HTMLElement => {
    const element: HTMLElement | null = document.getElementById(id);
    if (element === null) {
        throw new Error(`Could not find element with id "${id}"`);
    }
    return element;
};

export const apply = (selector: string, fn: (element: Element) => void) => {
    for (const element of document.querySelectorAll(selector)) {
        fn(element);
    }
};

export const create = <K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    id: string | null = null,
    classList: string[] = [],
): HTMLElementTagNameMap[K] => {
    const element: HTMLElementTagNameMap[K] = document.createElement(tagName);
    if (id !== null) {
        element.id = id;
    }
    element.classList.add(...classList);
    return element;
};

export type Button = {
    id?: string;
    label: string;
    onClick: (event: Event) => void;
    classList?: string[];
};

export type ModalButton = {
    id?: string;
    label: string;
    onClick: (event: Event) => boolean;
    classList?: string[];
};

const isButton = (button: Button): boolean => {
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

    if (
        "classList" in button &&
        !(
            Array.isArray(button.classList) &&
            button.classList.every((item) => typeof item === "string")
        )
    ) {
        console.error(
            `"classList" is not an array of strings in button "${button}"`,
        );
        return false;
    }

    return true;
};

export const createButton = (button: Button): HTMLButtonElement => {
    if (!isButton(button)) {
        throw Error(`Invalid button "${button}"`);
    }

    const newButton = create("button", button?.id, button.classList);
    newButton.textContent = button.label;

    tr.tr(button.label).then((text: string): void => {
        newButton.textContent = text;
    });

    newButton.addEventListener("click", (event: Event): void => {
        button.onClick(event);
        event.preventDefault();
        event.stopPropagation();
    });

    return newButton;
};

const appendButtonsTo = (
    parent: HTMLElement,
    buttons: Button[],
): HTMLButtonElement[] => {
    const buttonElements: HTMLButtonElement[] = [];
    for (const button of buttons) {
        const newButton: HTMLButtonElement = createButton(button);
        parent.append(newButton);
        buttonElements.push(newButton);
    }
    return buttonElements;
};

export type HTMLInputs =
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement;

export const generateCSSCompatibleString = (string: string): string => {
    //Lower case everything
    let returnString: string = string.toLowerCase();
    // remove all characters except alphanumeric and "-" / "_"
    returnString = returnString.replace(/[^a-zA-Z0-9_\-]/g, "");
    // remove multiple "-", "_" or whitespaces
    returnString = returnString.replace(/[\s_\-]+/g, "");
    // replace whitespaces and "_" by "-"
    returnString = returnString.replace(/[\s_]+/g, "-");
    return returnString;
};

export const generateRandomID = (length: number = 6): string => {
    let result: string = "";
    const characters: string =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const charactersLength: number = characters.length;
    let counter: number = 0;
    while (counter < length) {
        result += characters.charAt(
            Math.floor(Math.random() * charactersLength),
        );
        counter += 1;
    }
    return result;
};

export const insertAtCursor = (input: HTMLInputElement, text: string) => {
    const value: string = input.value;

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;

    input.value = value.slice(0, start) + text + value.slice(end);

    // update cursor to be at the end of insertion
    input.selectionStart = input.selectionEnd = start + text.length;
};

export const deleteAtCursor = (input: HTMLInputElement) => {
    const value: string = input.value;

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;

    input.value = value.slice(0, start - 1) + value.slice(end);

    // update cursor to be at the end of insertion
    input.selectionStart = input.selectionEnd = start - 1;
};

/**
 *
 * UI Components
 *
 */

export const showModal = async (
    id: string,
    content: HTMLElement | string,
    buttonsBottom: ModalButton[] = [],
    buttonsTop: ModalButton[] = [],
    onBackgroundClick: (id: string) => boolean = () => {
        return true;
    },
): Promise<void> => {
    const background = create("div", `${id}Background`, ["modal_background"]);
    const window = create("div", `${id}Window`, ["modal_window"]);
    background.append(window);

    const bottomBar: HTMLDivElement = create("div", null, [
        "pane",
        "modal_bar",
        "modal_bar_bottom",
    ]);

    for (const button of buttonsBottom) {
        const onClick: ModalButton["onClick"] = button.onClick;
        button.onClick = (event: Event) => {
            if (onClick(event)) {
                hideModal(id);
                return true;
            }
            return false;
        };
    }

    appendButtonsTo(bottomBar, buttonsBottom);

    const topBar: HTMLDivElement = create("div", null, [
        "pane",
        "modal_bar",
        "modal_bar_top",
    ]);

    appendButtonsTo(topBar, buttonsTop);

    const canvas: HTMLDivElement = create("div", id, ["modal_content"]);
    canvas.append(content);
    window.append(topBar, canvas, bottomBar);

    document.body.append(background);

    background.addEventListener("click", (event: Event): void => {
        if (onBackgroundClick(id)) {
            hideModal(id);
        }
        event.stopPropagation();
    });

    canvas.addEventListener("click", (event: Event): void => {
        event.stopPropagation();
    });
};

export const hideModal = (id: string): void => {
    get(`${id}Background`).remove();
};

export const showDialog = async (
    id: string,
    content: string,
    buttons: ModalButton[] = [],
    onBackgroundClick: (id: string) => boolean = () => {
        return false;
    },
): Promise<void> => {
    const text: string = await tr.tr(content);

    if (buttons.length === 0) {
        buttons.push({
            label: "button_ok",
            onClick: (): boolean => {
                return true;
            },
            classList: ["item_ref"],
        });
    }

    await showModal(id, text, buttons, [], onBackgroundClick);
};

export const showInfo = async (id: string, content: string): Promise<void> => {
    await showDialog(id, content);
};

export const createOkCancelButtons = (
    onConfirm: () => boolean,
    onCancel?: () => boolean,
): ModalButton[] => {
    const ok: ModalButton = {
        label: "button_ok",
        onClick: onConfirm,
        classList: ["item_ref"],
    };

    const cancel: ModalButton = {
        label: "button_cancel",
        onClick: onCancel
            ? onCancel
            : (): boolean => {
                  return true;
              },
        classList: ["item_pat"],
    };

    return [ok, cancel];
};

export const confirm = async (
    id: string,
    content: string,
    onConfirm: () => boolean,
    onCancel?: () => boolean,
): Promise<void> => {
    await showDialog(
        id,
        content,
        createOkCancelButtons(onConfirm, onCancel),
        onCancel,
    );
};
