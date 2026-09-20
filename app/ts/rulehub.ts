export type Signal = "activate" | "deactivate";
export type Rule = {
    phraseID: string;
    textblockID: string;
    callback: (
        type: RuleType,
        phraseID: string,
        textblockID: string,
        signal: Signal,
    ) => void;
};
export type RuleType = "set" | "suggestion" | "guide";
type RuleSet = Record<string, Rule[]>;
type RuleStore = Record<RuleType, RuleSet>;

const rules: RuleStore = { set: {}, suggestion: {}, guide: {} };

const getRules = (type: RuleType, trigger: string): Rule[] => {
    if (!(type in rules)) {
        rules[type] = {};
    }

    if (!(trigger in rules[type])) {
        rules[type][trigger] = [];
    }
    return rules[type][trigger];
};

export const register = (type: RuleType, trigger: string, rule: Rule): void => {
    getRules(type, trigger).push(rule);
};

export const activate = (type: RuleType, trigger: string): void => {
    getRules(type, trigger).forEach((rule) => {
        rule.callback(type, rule.phraseID, rule.textblockID, "activate");
    });
};

export const deactivate = (type: RuleType, trigger: string): void => {
    getRules(type, trigger).forEach((rule) => {
        rule.callback(type, rule.phraseID, rule.textblockID, "deactivate");
    });
};
