import * as base from "./base.js";
import { getConfig } from "./config.js";

let DICTIONARY: { [key: string]: string } = {};
let setReady: (value: any) => void;
let setError: (value: any) => void;
let READY: Promise<any> = new Promise(
    (resolve: (value: any) => void, reject: (value: any) => void): void => {
        setReady = resolve;
        setError = reject;
    },
);

export const init = (params: base.Params): void => {
    loadLanguage(params.language);
    translatePage();
};

const loadLanguage = (code: string): void => {
    READY = base
        .load(
            `${getConfig("languageURL")}/${code.substring(0, 2)}.json`,
            "json",
        )
        .then((data: any) => {
            console.log("Language data fetched.");
            let found_region: string = "";
            for (const key in data.regions) {
                if (data.regions[key].region === code) {
                    found_region = code;
                    DICTIONARY = data.regions[key].dict;
                }
            }

            if (found_region === "") {
                found_region = data.regions[0].region;
                DICTIONARY = data.regions[0].dict;
            }

            setLanguage(found_region);
            console.log("Language loaded");
            setReady(true);
        });
};

export const tr = async (
    expr: string,
    variables: Record<string, string> = {},
    def: string = "",
): Promise<string> => {
    await READY;

    let result: string = "";

    if (expr in DICTIONARY) {
        result = DICTIONARY[expr];
        result = base.replace(result, variables);
    } else if (def !== "") {
        result = def;
    } else {
        result = expr;
    }

    return Promise.resolve(result);
};

export const translatePage = async (): Promise<void> => {
    await READY;

    for (const element of document.querySelectorAll("[data-i18n-key]")) {
        const def: string = element.textContent || "";
        element.textContent = element.getAttribute("data-i18n-key") || def;
        tr(element.getAttribute("data-i18n-key") || "", {}, def).then(
            (result: string): void => {
                element.textContent = result;
            },
        );
    }
};

const setLanguage = (code: string): void => {
    for (const element of document.querySelectorAll("[lang]")) {
        (element as HTMLElement).lang = code;
    }
};
