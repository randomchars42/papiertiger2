// built upon
// https://codereview.stackexchange.com/a/215317/236617
// https://basarat.gitbook.io/typescript/main-1/typed-event
// https://stackoverflow.com/a/66003746/14979776

export interface Disposable {
    dispose(): void;
}

// used to check if parameters for .emit() are valid parameters for the event
// `Symbol` is needed to tell the compiler the resulting type can be `spread`
type EventTypes<T> = symbol & T extends (...args: infer U) => any ? U: never;
// create a map:
// EventMap = { "ListenerType1": Function[], ..., "ListenerTypeN": Function[] }
type ListenerRecord<T> = {[K in keyof T]: T[keyof T]};
type EventMap<T extends ListenerRecord<T>> = {[K in keyof T]: T[K][]};

export class EventEmitter<T extends ListenerRecord<T>> {
    protected listenersBefore: Partial<EventMap<T>> = {};
    protected listenersOn: Partial<EventMap<T>> = {};
    protected listenersAfter: Partial<EventMap<T>> = {};
    protected singleUseListeners: Partial<EventMap<T>> = {};

    protected getListenersBefore<K extends keyof T>(eventName: K): T[K][] {
        if (!this.listenersBefore[eventName]) {
            this.listenersBefore[eventName] = [];
        }
        return this.listenersBefore[eventName] as T[K][];
    }

    protected getListenersOn<K extends keyof T>(eventName: K): T[K][] {
        if (!this.listenersOn[eventName]) {
            this.listenersOn[eventName] = [];
        }
        return this.listenersOn[eventName] as T[K][];
    }

    protected getListenersAfter<K extends keyof T>(eventName: K): T[K][] {
        if (!this.listenersAfter[eventName]) {
            this.listenersAfter[eventName] = [];
        }
        return this.listenersAfter[eventName] as T[K][];
    }

    protected getSingleUseListeners<K extends keyof T>(eventName: K): T[K][] {
        if (!this.singleUseListeners[eventName]) {
            this.singleUseListeners[eventName] = [];
        }
        return this.singleUseListeners[eventName] as T[K][];
    }

    before<K extends keyof T>(eventName: K, listener: T[K]): Disposable {
        this.getListenersBefore(eventName).push(listener);
        return {
            dispose: () => {
                this.offBefore(eventName, listener);
            }
        }
    }

    on<K extends keyof T>(eventName: K, listener: T[K]): Disposable {
        this.getListenersOn(eventName).push(listener);
        return {
            dispose: () => {
                this.off(eventName, listener);
            }
        }
    }

    after<K extends keyof T>(eventName: K, listener: T[K]): Disposable {
        this.getListenersAfter(eventName).push(listener);
        return {
            dispose: () => {
                this.offAfter(eventName, listener);
            }
        }
    }

    once<K extends keyof T>(eventName: K, listener: T[K]): void {
        this.getSingleUseListeners(eventName).push(listener);
    }

    offBefore<K extends keyof T>(eventName: K, listener: T[K]): void {
        const listeners = this.getListenersBefore(eventName);
        const index = listeners.indexOf(listener);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    }

    off<K extends keyof T>(eventName: K, listener: T[K]): void {
        const listeners = this.getListenersOn(eventName);
        const index = listeners.indexOf(listener);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    }

    offAfter<K extends keyof T>(eventName: K, listener: T[K]): void {
        const listeners = this.getListenersAfter(eventName);
        const index = listeners.indexOf(listener);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    }

    emit<K extends keyof T>(eventName: K, ...paramList: EventTypes<T[K]>): void {
        for (const listener of this.getListenersBefore(eventName)) {
            listener(...paramList);
        }
        for (const listener of this.getListenersOn(eventName)) {
            listener(...paramList);
        }
        for (const listener of this.getListenersAfter(eventName)) {
            listener(...paramList);
        }

        if (this.getSingleUseListeners(eventName).length > 0) {
            const callstack = this.getSingleUseListeners(eventName);
            for (const listener of callstack) {
                listener(...paramList)
            }
            this.getSingleUseListeners(eventName).splice(0);
        }
    }
}

type SimpleEvent = (payload: string) => {};
type SimpleEventMap = Record<string,SimpleEvent[]>

export class SimpleEmitter {
    private listeners: SimpleEventMap = {}

    protected getListeners(eventName: string): SimpleEvent[] {
        if (!(eventName in this.listeners)) {
            this.listeners[eventName] = []
        }
        return this.listeners[eventName];
    }

    public on(eventName: string, callback: SimpleEvent): void {
        this.getListeners(eventName).push(callback);
    }

    public emit(eventName: string): void {
        this.getListeners(eventName).forEach((callback) => {
            callback(eventName);
        });
    }

    public reset(): void {
        this.listeners = {};
    }
}
