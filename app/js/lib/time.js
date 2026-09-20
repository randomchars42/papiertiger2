export const formatDate = (time, format = '%Y-%m-%d') => {
    const date = new Date(time);
    let resultString = format.replaceAll('%Y', date.getUTCFullYear().toString());
    resultString = resultString.replaceAll('%y', date.getUTCFullYear().toString().slice(-2));
    resultString = resultString.replaceAll('%m', (date.getUTCMonth() + 1).toString().padStart(2, '0'));
    resultString = resultString.replaceAll('%d', date.getUTCDate().toString().padStart(2, '0'));
    return resultString;
};
export const formatTimeDiff = (elapsedTime, format = '%H:%M:%S') => {
    const negative = (elapsedTime < 0);
    let timeDiff = elapsedTime;
    let resultString = format;
    if (negative) {
        timeDiff = elapsedTime * -1;
    }
    let seconds = Math.floor(timeDiff / 1000);
    let minutes = Math.floor(seconds / 60);
    seconds = seconds - minutes * 60;
    if (format.includes('%H')) {
        const hours = Math.floor(minutes / 60);
        minutes = minutes - hours * 60;
        resultString = resultString.replaceAll('%H', hours.toString().padStart(2, '0'));
    }
    resultString = resultString.replaceAll('%M', minutes.toString().padStart(2, '0'));
    resultString = resultString.replaceAll('%S', seconds.toString().padStart(2, '0'));
    if (negative) {
        resultString = `- ${resultString}`;
    }
    return resultString;
};
export const formatTime = (time, format = '%H:%M:%S') => {
    const date = new Date(time);
    date.setHours(0, 0, 0, 0);
    const elapsedTime = time - date.getTime();
    return formatTimeDiff(elapsedTime, format);
};
export const formatDateTime = (time, format = '%Y-%m-%dT%H:%M:%S') => {
    return formatDate(time, formatTime(time, format));
};
export const sleep = (milliseconds) => {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
};
;
;
;
export const debounce = (fn, milliseconds) => {
    let timer;
    const debouncedFunction = (...args) => new Promise((resolve) => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            resolve(fn(...args));
        }, milliseconds);
    });
    const teardownFunction = () => clearTimeout(timer);
    return [debouncedFunction, teardownFunction];
};
export class Ticker {
    constructor(interval = 1000, onTick = () => { }, onError = () => { }) {
        this.interval = 1000;
        this.timeout = null;
        this.last = Math.floor(Date.now() / this.interval) * this.interval;
        this.expected = 0;
        this.interval = interval;
        this.onTick = onTick;
        this.onError = onError;
    }
    start() {
        this.last = Math.floor(Date.now() / this.interval) * this.interval;
        this.expected = this.last + this.interval;
        this.timeout = setTimeout(() => { this.tick(); }, this.interval);
    }
    tick() {
        const now = Date.now();
        let smoothed = Math.floor(now / this.interval) * this.interval;
        smoothed = smoothed > this.last ? smoothed : smoothed + this.interval;
        this.onTick(smoothed);
        this.last = smoothed;
        let drift = now - this.expected;
        if (drift > this.interval) {
            console.error(`Drift: ${drift} ms`);
            this.expected = now;
            drift = 0;
            this.onError();
        }
        this.expected += this.interval;
        this.timeout = setTimeout(() => { this.tick(); }, Math.max(0, this.interval - drift));
    }
    stop() {
        if (!this.timeout) {
            return;
        }
        clearTimeout(this.timeout);
    }
    getLastTick() {
        return this.last;
    }
    static getElapsedTime(start, end, countAtStart = 0, interval = 1000, tolerance = 100) {
        const diff = end - start;
        let elapsedIntervals = Math.floor(diff / interval);
        if (elapsedIntervals === 0 && interval - diff < tolerance) {
            elapsedIntervals = 1;
        }
        return countAtStart + (elapsedIntervals * 1000);
    }
}
;
