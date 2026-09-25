export const loadJSON = async (file: string): Promise<unknown> => {
    const response = await fetch(file);
    if (!response.ok) {
        throw new Error(`Request for "${file}" failed with HTTP ${response.status}`);
    }
    try {
        return await response.json();
    } catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : "";
        throw new Error(`Response from "${file}" is not valid JSON${detail}`);
    }
};
