import * as base from "./base.js";
import { getConfig } from "./config.js";
let DICTIONARY = {};
let setReady;
let setError;
let READY = new Promise((resolve, reject) => {
    setReady = resolve;
    setError = reject;
});
export const init = (params) => {
    loadLanguage(params.language);
    translatePage();
};
const loadLanguage = (code) => {
    READY = base
        .load(`${getConfig("languageURL")}/${code.substring(0, 2)}.json`, "json")
        .then((data) => {
        console.log("Language data fetched.");
        let found_region = "";
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
export const tr = async (expr, variables = {}, def = "") => {
    await READY;
    let result = "";
    if (expr in DICTIONARY) {
        result = DICTIONARY[expr];
        result = base.replace(result, variables);
    }
    else if (def !== "") {
        result = def;
    }
    else {
        result = expr;
    }
    return Promise.resolve(result);
};
export const translatePage = async () => {
    await READY;
    for (const element of document.querySelectorAll("[data-i18n-key]")) {
        const def = element.textContent || "";
        element.textContent = element.getAttribute("data-i18n-key") || def;
        tr(element.getAttribute("data-i18n-key") || "", {}, def).then((result) => {
            element.textContent = result;
        });
    }
};
const setLanguage = (code) => {
    for (const element of document.querySelectorAll("[lang]")) {
        element.lang = code;
    }
};
