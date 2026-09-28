import type { ItemKind } from "../textblock/textblocktypes.js";

export type ScoreOption = {
    valueId: string;
    text: string;
    kind: ItemKind;
    points: number | "UN";
};

export type ScoreCriterion = {
    phraseId: string;
    title: string;
    options: ScoreOption[];
};

export type ScoreRuleSelection = {
    phraseId: string;
    valueId: string;
};

export type ScoreRule = {
    when: ScoreRuleSelection;
    set: ScoreRuleSelection[];
};

export type ScoreDefinition = {
    id: string;
    label: string;
    minimum: number;
    maximum: number;
    criteria: ScoreCriterion[];
    rules?: ScoreRule[];
    target: {
        phraseId: string;
        valueId: string;
        attributeId: string;
    };
};

export type DerivedScoreSelection = {
    valueId: string;
    triggerPhraseId: string;
    triggerValueId: string;
};

export type ScoreCalculation =
    | { kind: "incomplete"; completed: number }
    | {
          kind: "total";
          completed: number;
          total: number;
          unavailablePhraseIds: string[];
      };

export type ScoreModuleState = {
    parentId: string;
    groupId: string;
    instanceId?: string;
    score: ScoreDefinition;
    selected: Record<string, string>;
    derived: Record<string, DerivedScoreSelection>;
    status: string;
};
