/**
 * Holds the descriptions of the items.
 */
export type Stack = {
    groups: { [key: string]: Group };
    phrases: { [key: string]: Phrase };
};

/**
 * Holds the state of the items.
 */
export type StackState = {
    groups: { [key: string]: GroupState };
    phrases: { [key: string]: PhraseState };
};

export type Item = {
    /**
     * Identifier.
     */
    id: string;

    /**
     * Describes the item.
     *
     * Is displayed if phrase / group is inactive to activate it.
     */
    title: string;

    /**
     * A not that can be displayed.
     */
    note: string;
};

export type ItemState = {
    id: string;

    /**
     * Indicates if the item holds a value that should be used in the final
     * result.
     *
     * If an item is "inactive" its title will be displayed for the user
     * to activate the item.
     * If a group is "inactive" its children / content will be hidden.
     * If a group has status "default" its title will be used in the final
     * output.
     */
    state: "default" | "inactive";

    /**
     * The value that will be used in the final result.
     */
    value: string;
};

export type Group = Item & {
    /**
     * IDs of the children (other groups) of this group.
     *
     * A group may either have children or hold phrases.
     */
    children: string[];

    /**
     * ID of content to be displayed.
     */
    content?: string;

    /**
     * IDs of phrases to be displayed.
     *
     * A group may either have children or hold phrases.
     */
    phrases: string[];

    /**
     * Sets.
     *
     * "id" -> "title"
     */
    sets: { [key: string]: string };

    /**
     * Default state.
     */
    default: "default" | "inactive";
};

export type GroupState = ItemState & {
    /**
     * Holds a state for each set.
     *
     * "id" -> state (true: active, false: inactive)
     */
    sets: { [key: string]: boolean };
};

export type Phrase = Item & {
    /**
     * ID of the default alternative that will be displayed if defaults are
     * requested.
     */
    default: string;

    /**
     * Textblocks that can be selected for this phrase.
     *
     * "id" -> "content"
     */
    textblocks: { [key: string]: string };

    /**
     * Rules to respond to changes in other phrases with suggestions.
     *
     * e.g., textblock ID_XYZ is activated in another phrase so this phrase will
     * suggest textblock ID_ABC if it was not modified by the user.
     *
     * "foreign_textblock_id" -> "id"
     */
    suggestions: { [key: string]: string };

    /**
     * Rules to respond to sets.
     *
     * e.g., set ID_XYZ is activated so this phrase will
     * be set to textblock ID_ABC if it was not modified by the user.
     *
     * "set_id" -> "id"
     */
    setRules: { [key: string]: string };

    /**
     * TODO
     */
    attributes: { [key: string]: string };
};

export type PhraseState = Omit<ItemState, "state"> & {
    /**
     * Phrases can be in more states.
     *
     * "modified" indicates that a textblock was set by the user.
     * "suggested" indicates that a textblock was suggested by another textblock.
     * "set" indicates that a textblock was activated by a set.
     */
    state: ItemState["state"] | "modified" | "suggested" | "set" | "hidden";

    /**
     * ID of the currently active textblock.
     */
    textblock: string;
};
