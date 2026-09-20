export class EventEmitter {
    constructor() {
        this.listenersBefore = {};
        this.listenersOn = {};
        this.listenersAfter = {};
        this.singleUseListeners = {};
    }
    getListenersBefore(eventName) {
        if (!this.listenersBefore[eventName]) {
            this.listenersBefore[eventName] = [];
        }
        return this.listenersBefore[eventName];
    }
    getListenersOn(eventName) {
        if (!this.listenersOn[eventName]) {
            this.listenersOn[eventName] = [];
        }
        return this.listenersOn[eventName];
    }
    getListenersAfter(eventName) {
        if (!this.listenersAfter[eventName]) {
            this.listenersAfter[eventName] = [];
        }
        return this.listenersAfter[eventName];
    }
    getSingleUseListeners(eventName) {
        if (!this.singleUseListeners[eventName]) {
            this.singleUseListeners[eventName] = [];
        }
        return this.singleUseListeners[eventName];
    }
    before(eventName, listener) {
        this.getListenersBefore(eventName).push(listener);
        return {
            dispose: () => {
                this.offBefore(eventName, listener);
            }
        };
    }
    on(eventName, listener) {
        this.getListenersOn(eventName).push(listener);
        return {
            dispose: () => {
                this.off(eventName, listener);
            }
        };
    }
    after(eventName, listener) {
        this.getListenersAfter(eventName).push(listener);
        return {
            dispose: () => {
                this.offAfter(eventName, listener);
            }
        };
    }
    once(eventName, listener) {
        this.getSingleUseListeners(eventName).push(listener);
    }
    offBefore(eventName, listener) {
        const listeners = this.getListenersBefore(eventName);
        const index = listeners.indexOf(listener);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    }
    off(eventName, listener) {
        const listeners = this.getListenersOn(eventName);
        const index = listeners.indexOf(listener);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    }
    offAfter(eventName, listener) {
        const listeners = this.getListenersAfter(eventName);
        const index = listeners.indexOf(listener);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    }
    emit(eventName, ...paramList) {
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
                listener(...paramList);
            }
            this.getSingleUseListeners(eventName).splice(0);
        }
    }
}
export class SimpleEmitter {
    constructor() {
        this.listeners = {};
    }
    getListeners(eventName) {
        if (!(eventName in this.listeners)) {
            this.listeners[eventName] = [];
        }
        return this.listeners[eventName];
    }
    on(eventName, callback) {
        this.getListeners(eventName).push(callback);
    }
    emit(eventName) {
        this.getListeners(eventName).forEach((callback) => {
            callback(eventName);
        });
    }
    reset() {
        this.listeners = {};
    }
}
