export const formatDate = (time: Time, format: string = '%Y-%m-%d'): string => {
    const date: Date = new Date(time);

    let resultString: string = format.replaceAll('%Y', date.getUTCFullYear().toString());

    resultString = resultString.replaceAll('%y', date.getUTCFullYear().toString().slice(-2));

    resultString = resultString.replaceAll('%m', (date.getUTCMonth() + 1).toString().padStart(2, '0'));

    resultString = resultString.replaceAll('%d', date.getUTCDate().toString().padStart(2, '0'));

    return resultString;
};

export const formatTimeDiff = (elapsedTime: ElapsedTime, format: string = '%H:%M:%S'): string => {
    const negative: boolean = (elapsedTime < 0);
    let timeDiff: ElapsedTime = elapsedTime;
    let resultString: string = format;

    if (negative) {
        timeDiff = elapsedTime * -1;
    }

    let seconds: number = Math.floor(timeDiff / 1000);
    let minutes: number = Math.floor(seconds / 60);
    seconds = seconds - minutes * 60;

    if (format.includes('%H')) {
        const hours: number = Math.floor(minutes / 60);
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

export const formatTime = (time: Time, format: string = '%H:%M:%S'): string => {
    const date: Date = new Date(time);
    date.setHours(0, 0, 0, 0)
    const elapsedTime: Time = time - date.getTime();

    return formatTimeDiff(elapsedTime, format);
};

export const formatDateTime = (time: Time, format: string = '%Y-%m-%dT%H:%M:%S'): string => {
    return formatDate(time, formatTime(time, format));
};

/**
 * Adapted from: https://stackoverflow.com/questions/37764665/#37764963
 * Usage:
 * ```
 * // sleep 2 seconds:
 * await sleep(2000);
 * // or
 * sleep(2000)
 * .then((): void => { doSomethin();});
 * ```
 */
export const sleep = (milliseconds: number): Promise<void> => {
    return new Promise((resolve: (value: any) => void): void => {
        setTimeout(resolve, milliseconds);
    });
};

interface FunctionWithArguments {
    // biome-ignore lint/style/useShorthandFunctionType: needed for next interface
    (...args: any[]): any;
};

interface DebouncedFunction<F extends FunctionWithArguments> {
    // biome-ignore lint/style/useShorthandFunctionType: needed for next interface
    (...args: Parameters<F>): Promise<ReturnType<F>>;
};

export interface DebounceReturn<F extends FunctionWithArguments> extends Array<DebouncedFunction<F> | (() => void)> {
    0: (...args: Parameters<F>) => Promise<ReturnType<F>>;
    1: () => void;
};

/**
 * Adapted from: https://dev.to/bwca/create-a-debounce-function-from-scratch-in-typescript-560m
 * Usage:
 * ```
 * const debouncedFunction = debounce((): void => {console.log('!')}, 2000)[0];
 * const run = async (): void => {
 *     console.log('Start');
 *     debouncedFunction();
 *     debouncedFunction();
 *     debouncedFunction();
 *     debouncedFunction();
 *     debouncedFunction();
 *     console.log('Going to sleep');
 *     await sleep(2100);
 *     console.log('Woke up');
 *     debouncedFunction();
 * }
 * run();
 * // Expected Output:
 * // "Start"
 * // "Going to sleep"
 * // After 2000 ms:
 * // "!"
 * // After 2100 ms in total:
 * // "Woke up"
 * // After another 2000 ms:
 * // "!"
 * ```
 */
export const debounce = <F extends FunctionWithArguments>(fn: F, milliseconds: number): DebounceReturn<F> => {
    let timer: ReturnType<typeof setTimeout>;

    const debouncedFunction: DebouncedFunction<F> = (...args) =>
    new Promise((resolve) => {
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

/**
 * Time in milliseconds as returned by `Date.now()`.
 */
export type Time = number;

/**
 * Time difference in milliseconds.
 */
export type ElapsedTime = number;

export class Ticker {
    private interval: number = 1000;
    private onTick: (time: Time) => void;
    private onError: () => void;
    private timeout: ReturnType<typeof setTimeout>|null = null;
    private last: Time = Math.floor(Date.now() / this.interval) * this.interval;
    private expected: Time = 0;

    constructor(interval: number = 1000, onTick: (time: Time) => void = ():void => {}, onError: () => void = (): void => {}) {
        this.interval = interval;
        this.onTick = onTick;
        this.onError = onError;
    }

    public start(): void {
        this.last = Math.floor(Date.now() / this.interval) * this.interval;
        this.expected = this.last + this.interval;
        this.timeout = setTimeout(() => { this.tick(); }, this.interval );
    }

    /**
     * This will compensate for the interval becoming longer (drift) by
     * shortening the interval to the next tick based on the last drift.
     *
     * If by chance the drift has made the interval so long that it "missed"
     * a tick (e.g., the `SetTimeout` was paused by the browser because the 
     * browser tab was inactive) it will just accept the situation instead of
     * trying to "catch up" with zero length intervals.
     */
    private tick(): void {
        const now: Time = Date.now();
        let smoothed: Time = Math.floor(now / this.interval) * this.interval;
        smoothed = smoothed > this.last ? smoothed : smoothed + this.interval;
        this.onTick(smoothed);
        this.last = smoothed;
        let drift = now - this.expected;

        if (drift > this.interval) {
            // there was so much drift it practically missed a tick
            console.error(`Drift: ${drift} ms`);
            this.expected = now;
            drift = 0;
            this.onError();
        }

        // the next point in time we aim at
        this.expected += this.interval;
        // shorten the interval by the current drift but do
        this.timeout = setTimeout(() => { this.tick() }, Math.max(0, this.interval - drift));
    }

    public stop(): void {
        if (!this.timeout) {
            return;
        }
        clearTimeout(this.timeout);
    }

    public getLastTick(): Time {
        return this.last;
    }

    /**
     * Calculate the number of intervals (seconds for `interval = 1000` or
     * milliseconds for `interval = 1`) between `start` and `end` .
     *
     * Try to compensate for irregular update intervals.
     */
    public static getElapsedTime(start: Time,
                           end: Time,
                           countAtStart: ElapsedTime = 0,
                           interval: number = 1000,
                           tolerance: number = 100): number {
        // elapsed time in milliseconds since last start
        const diff = end - start;
        // elapsed intervals since last start
        // usually seconds (`interval = 1000`) or
        // milliseconds (`interval = 1)
        let elapsedIntervals = Math.floor(diff / interval);

        if (elapsedIntervals === 0 && interval - diff < tolerance) {
            // difference to next step is within tolerance
            // e.g. 100 milliseconds left until the next full second
            elapsedIntervals = 1;
        }

        // take the number of steps at the last start and add the difference
        return countAtStart + (elapsedIntervals * 1000);
    }
};
