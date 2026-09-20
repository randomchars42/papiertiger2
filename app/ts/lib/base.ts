export type Params = {
    language: string;
    config: string;
};

export const parseURL = (params: Params): void => {
    const parsedURL = new URL(window.location.href);
    let key: keyof typeof params;
    for (key in params) {
        if (parsedURL.searchParams.has(key)) {
            params[key] = parsedURL.searchParams.get(key)!;
        }
    }
};

type LoadTypeNames = "string" | "json";
type LoadReturn<T extends LoadTypeNames> = T extends "json" ? unknown : string;

export const load = async <T extends LoadTypeNames>(
    file: string,
    type: T,
): Promise<LoadReturn<T>> => {
    return fetch(file)
        .then((response: Response): Response => {
            if (!response.ok) {
                throw new Error(`Failed with HTTP code ${response.status}`);
            }
            return response;
        })
        .then(async (result: Response): Promise<LoadReturn<T>> => {
            return type === "json" ? result.json() : result.text();
        })
        .catch((): Promise<T> => {
            console.error(
                `Processing of response to request for "${file}" failed`,
            );
            return Promise.reject();
        });
};

export const replace = (
    text: string,
    replace: Record<string, string>,
): string => {
    let resultString: string = text;
    // replace all placeholders in `text`
    // a placeholder looks like `${PLACEHOLDER}`
    for (const [needle, replacement] of Object.entries(replace)) {
        resultString = resultString.replaceAll(`\${${needle}}`, replacement);
    }
    return resultString;
};

export const isIOS = (): boolean => {
    return (
        [
            "iPad Simulator",
            "iPhone Simulator",
            "iPod Simulator",
            "iPad",
            "iPhone",
            "iPod",
        ].includes(navigator.platform) ||
        // iPad on iOS 13 detection
        (navigator.userAgent.includes("Mac") && "ontouchend" in document)
    );
};
