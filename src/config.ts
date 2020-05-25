'use strict';

import { readFileSync, writeFile } from 'fs';

type TLaneName = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT'
type TGameMode = 'FLEX' | 'SOLOQ' | 'NORMAL' | 'ARAM'

interface LanePreference {
    lane: TLaneName
    pick: string[]
    ban: string[]
}

export class Config {
    static CONFIG_FILENAME = './userconfig.json'

    autolobby: boolean
    autoposition: boolean
    autosearch: boolean
    autoaccept: boolean
    autodeclare: boolean
    autoban: boolean
    autopick: boolean
    autorunes: boolean
    autosummoners: boolean
    scaleFactor: number
    lanePreferences: LanePreference[]
    firstLane: TLaneName
    secondLane: TLaneName
    preferredGameType: TGameMode


    constructor(overrideFileName?: string) {
        this.autolobby = false
        this.autoposition = false
        this.autosearch = false
        this.autoaccept = false
        this.autodeclare = false
        this.autoban = false
        this.autopick = false
        this.autorunes = false
        this.autosummoners = false
        this.scaleFactor = 2
        this.lanePreferences = []
        this.preferredGameType = 'NORMAL'
        this.firstLane = 'SUPPORT'
        this.secondLane = 'MID'

        const filePath = overrideFileName || Config.CONFIG_FILENAME
        let rawConfig = null
        try {
            rawConfig = JSON.parse(readFileSync(filePath).toString())
        } catch (err) { console.warn(err); console.log(filePath) } // eslint-disable-line no-empty

        Object.assign(this, rawConfig)
    }

    async writeConfig(): Promise<any> {
        return new Promise(res => {
            const serializedData = JSON.stringify(this, undefined, '    ')
            writeFile(Config.CONFIG_FILENAME, serializedData, res)
        })
    }

    get isValid(): boolean {
        return true
        const lanes = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']

        return typeof this.autolobby === 'boolean' &&
            typeof this.autoposition === 'boolean' &&
            typeof this.autosearch === 'boolean' &&
            typeof this.autoaccept === 'boolean' &&
            typeof this.autodeclare === 'boolean' &&
            typeof this.autoban === 'boolean' &&
            typeof this.autopick === 'boolean' &&
            typeof this.autorunes === 'boolean' &&
            typeof this.autosummoners === 'boolean' &&
            typeof this.preferredGameType === 'string' &&
            typeof this.scaleFactor === 'number' &&
            lanes.includes(this.firstLane) &&
            lanes.includes(this.secondLane) &&
            lanes.every(l => this.lanePreferences[l] !== undefined) &&
            this.lanePreferences.every(p => lanes.includes(p.lane) &&
                p.ban.every(b => typeof b === 'string') &&
                p.pick.every(p => typeof p === 'string')
            )
    }
}