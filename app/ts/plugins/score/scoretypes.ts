import type { ItemKind } from "../textblock/textblocktypes.js";

export type ScoreOption = {
    valueId: string;
    text: string;
    kind: ItemKind;
    points: number;
};

export type ScoreCriterion = {
    phraseId: string;
    title: string;
    options: ScoreOption[];
};

export type ScoreDefinition = {
    id: string;
    label: string;
    minimum: number;
    maximum: number;
    criteria: ScoreCriterion[];
    target: {
        phraseId: string;
        valueId: string;
        attributeId: string;
    };
};

export type ScoreModuleState = {
    parentId: string;
    groupId: string;
    instanceId?: string;
    score: ScoreDefinition;
    selected: Record<string, string>;
    status: string;
};
