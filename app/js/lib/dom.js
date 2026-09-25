export const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className !== undefined)
        node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
};
export const actionButton = (label, action, data = {}, className = "control") => {
    const button = element("button", className, label);
    button.type = "button";
    button.dataset.action = action;
    Object.assign(button.dataset, data);
    return button;
};
export const iconActionButton = (icon, label, action, data = {}, className = "control") => {
    const button = actionButton(icon, action, data, `${className} control--icon`);
    button.setAttribute("aria-label", label);
    button.title = label;
    return button;
};
export const copyToClipboard = async (text) => {
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
    if (!copied)
        throw new Error("Clipboard access failed");
};
