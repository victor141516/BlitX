'use strict';

import { readFileSync, writeFile } from 'fs';

type TLaneName = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';
type TGameMode = 'FLEX' | 'SOLOQ' | 'NORMAL' | 'ARAM';

export interface LanePreference {
    lane: TLaneName;
    pick: string[];
    ban: string[];
    summoners: { first: string, second: string }
}

export class Config {
    static CONFIG_FILENAME = './userconfig.json';

    private _configFilename = Config.CONFIG_FILENAME;

    autolobby: boolean;
    autoposition: boolean;
    autosearch: boolean;
    autoaccept: boolean;
    autodeclare: boolean;
    autoban: boolean;
    autopick: boolean;
    autorunes: boolean;
    autosummoners: boolean;
    scaleFactor: number;
    lanePreferences: LanePreference[];
    primaryPosition: TLaneName;
    secondaryPosition: TLaneName;
    preferredGameMode: TGameMode;

    constructor(overrideFileName?: string) {
        this.autolobby = false;
        this.autoposition = false;
        this.autosearch = false;
        this.autoaccept = false;
        this.autodeclare = false;
        this.autoban = false;
        this.autopick = false;
        this.autorunes = false;
        this.autosummoners = false;
        this.scaleFactor = 2;
        this.lanePreferences = [];
        this.preferredGameMode = 'NORMAL';
        this.primaryPosition = 'SUPPORT';
        this.secondaryPosition = 'MID';

        this._configFilename = overrideFileName || Config.CONFIG_FILENAME;
        this.readConfig();
    }

    readConfig(): void {
        try {
            const rawConfig = JSON.parse(
                readFileSync(this._configFilename).toString()
            );
            Object.assign(this, rawConfig);
        } catch { } // eslint-disable-line no-empty
    }

    async writeConfig(): Promise<any> {
        return new Promise(res => {
            const data = Object.keys(this).filter(k => !k.startsWith('_')).reduce((acc, k) => Object.assign({}, acc, { [k]: this[k] }), {})
            const serializedData = JSON.stringify(data, undefined, '    ');
            writeFile(this._configFilename, serializedData, res);
        });
    }

    get isValid(): boolean {
        return true;
        const lanes = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

        return (
            typeof this.autolobby === 'boolean' &&
            typeof this.autoposition === 'boolean' &&
            typeof this.autosearch === 'boolean' &&
            typeof this.autoaccept === 'boolean' &&
            typeof this.autodeclare === 'boolean' &&
            typeof this.autoban === 'boolean' &&
            typeof this.autopick === 'boolean' &&
            typeof this.autorunes === 'boolean' &&
            typeof this.autosummoners === 'boolean' &&
            typeof this.preferredGameMode === 'string' &&
            typeof this.scaleFactor === 'number' &&
            lanes.includes(this.primaryPosition) &&
            lanes.includes(this.secondaryPosition) &&
            lanes.every(l => this.lanePreferences[l] !== undefined) &&
            this.lanePreferences.every(
                p =>
                    lanes.includes(p.lane) &&
                    p.ban.every(b => typeof b === 'string') &&
                    p.pick.every(p => typeof p === 'string') &&
                    typeof p.summoners.first === 'string' &&
                    typeof p.summoners.second === 'string'
            )
        );
    }
}
