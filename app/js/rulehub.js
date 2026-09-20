const rules = { set: {}, suggestion: {}, guide: {} };
const getRules = (type, trigger) => {
    if (!(type in rules)) {
        rules[type] = {};
    }
    if (!(trigger in rules[type])) {
        rules[type][trigger] = [];
    }
    return rules[type][trigger];
};
export const register = (type, trigger, rule) => {
    getRules(type, trigger).push(rule);
};
export const activate = (type, trigger) => {
    getRules(type, trigger).forEach((rule) => {
        rule.callback(type, rule.phraseID, rule.textblockID, "activate");
    });
};
export const deactivate = (type, trigger) => {
    getRules(type, trigger).forEach((rule) => {
        rule.callback(type, rule.phraseID, rule.textblockID, "deactivate");
    });
};
