export const deSCTIDText = (text: string): string => {
    const index: number = text.lastIndexOf("|");

    if (index === -1) {
        return text;
    }

    return text.substring(index + 1);
};

export const getSCTIDFromText = (text: string): string => {
    const index: number = text.indexOf("|");

    if (index === -1) {
        return "";
    }

    return text.substring(0, index);
};
