export const deSCTIDText = (text) => {
    const index = text.lastIndexOf("|");
    if (index === -1) {
        return text;
    }
    return text.substring(index + 1);
};
export const getSCTIDFromText = (text) => {
    const index = text.indexOf("|");
    if (index === -1) {
        return "";
    }
    return text.substring(0, index);
};
