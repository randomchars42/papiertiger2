export const parseURL = (params) => {
    const parsedURL = new URL(window.location.href);
    let key;
    for (key in params) {
        if (parsedURL.searchParams.has(key)) {
            params[key] = parsedURL.searchParams.get(key);
        }
    }
};
export const load = async (file, type) => {
    return fetch(file)
        .then((response) => {
        if (!response.ok) {
            throw new Error(`Failed with HTTP code ${response.status}`);
        }
        return response;
    })
        .then(async (result) => {
        return type === "json" ? result.json() : result.text();
    })
        .catch(() => {
        console.error(`Processing of response to request for "${file}" failed`);
        return Promise.reject();
    });
};
export const replace = (text, replace) => {
    let resultString = text;
    for (const [needle, replacement] of Object.entries(replace)) {
        resultString = resultString.replaceAll(`\${${needle}}`, replacement);
    }
    return resultString;
};
export const isIOS = () => {
    return ([
        "iPad Simulator",
        "iPhone Simulator",
        "iPod Simulator",
        "iPad",
        "iPhone",
        "iPod",
    ].includes(navigator.platform) ||
        (navigator.userAgent.includes("Mac") && "ontouchend" in document));
};
