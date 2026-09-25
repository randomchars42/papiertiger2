export const element = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

export const actionButton = (
    label: string,
    action: string,
    data: Record<string, string> = {},
    className = "control",
): HTMLButtonElement => {
    const button = element("button", className, label);
    button.type = "button";
    button.dataset.action = action;
    Object.assign(button.dataset, data);
    return button;
};

export const iconActionButton = (
    icon: string,
    label: string,
    action: string,
    data: Record<string, string> = {},
    className = "control",
): HTMLButtonElement => {
    const button = actionButton(icon, action, data, `${className} control--icon`);
    button.setAttribute("aria-label", label);
    button.title = label;
    return button;
};

export const copyToClipboard = async (text: string): Promise<void> => {
    if (navigator.clipboard !== undefined && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = element("textarea", "clipboard-fallback");
    textarea.value = text;
    textarea.readOnly = true;
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard access failed");
};
