import * as LC from '../league-connect';
import cheerio from 'cheerio';
import got from 'got';


function normalize(s: string): string {
    return s.replace(/[^a-zA-Z]/g, '').toUpperCase()
}

export type TBlitxPositions = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT'
export const BlitxPositions = {
    TOP: 'TOP',
    JUNGLE: 'JUNGLE',
    MID: 'MID',
    ADC: 'ADC',
    SUPPORT: 'SUPPORT'
}

export class LolApi {
    leagueConnect: any
    credentials: LC.Credentials | undefined
    private _websocket: LC.LeagueWebSocket | null
    private _pollerResponses: { [key: string]: string }

    constructor() {
        this.credentials = undefined
        LC.auth().then((c: LC.Credentials) => (this.credentials = c)).catch(() => { })
        this._websocket = null

        this._pollerResponses = {}
    }

    get websocket(): Promise<LC.LeagueWebSocket> {
        return new Promise(async res => {
            if (!this._websocket) {
                if (!this.credentials) await this.waitForLol()
                this._websocket = await LC.connect(this.credentials)
            }
            res(this._websocket as LC.LeagueWebSocket)
        })
    }

    async waitForLol(): Promise<void> {
        if (this.credentials) return

        let initLoopId: NodeJS.Timeout | null = null
        let loadedLoopId: NodeJS.Timeout | null = null

        return new Promise(res => {
            const loadedLoop = () => this.request('/lol-lobby/v2/comms/members', 'GET').then(r => {
                if (r.httpStatus !== 404 && r.partyId !== '') {
                    clearInterval(loadedLoopId as NodeJS.Timeout)
                    res()
                }
            }).catch(console.warn)

            const initLoop = () => LC.auth().then((c: LC.Credentials) => {
                this.credentials = c
                clearInterval(initLoopId as NodeJS.Timeout)
                loadedLoopId = setInterval(loadedLoop, 1000)
            }).catch((e: any) => {
                if (e.message !== 'League Client could not be located.') throw e
            })

            initLoopId = setInterval(initLoop, 1000);
        })
    }

    request(url: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: any): Promise<any> {
        return LC.request({ url, method, body }, this.credentials).then((t: any) => {
            try {
                if (t.status === 204) return {}
                else return t.body ? JSON.parse(t.body) : {}
            } catch {
                console.log(t)
            }
        })
    }

    async observe(url: string, cb: (arg0: any) => {}): Promise<{ unsubscribe: () => {} }> {
        return new Promise(res => {
            this.request(url, 'GET').then(async r => {
                const obs = this._observe(
                    url,
                    r => {
                        cb(r)
                        res(obs)
                    }
                )

                if (!r.errorCode) {
                    cb(r)
                    res(obs)
                }

            }).catch(err => {
                // console.warn(`Error while observing ${url}:`, err)
                const obs = this._observe(
                    url,
                    r => {
                        cb(r)
                        res(obs)
                    }
                )
            })
        })
    }

    async _observe(url: string, cb: (arg0: any) => any): Promise<{ unsubscribe: () => {} }> {
        (await this.websocket).subscribe(url, cb)
        return {
            unsubscribe: async () => ((await this.websocket).unsubscribe(url))
        }
    }
}

interface IChampion {
    id: number
    name: string
    isPickable: boolean | null
    isBannable: boolean | null
    icon: string
}

export class Champion {
    id: number
    name: string
    isPickable: boolean | null
    isBannable: boolean | null
    icon: string

    constructor(c: IChampion) {
        this.id = c.id
        this.name = c.name
        this.isPickable = c.isPickable
        this.isBannable = c.isBannable
        this.icon = c.icon
    }
}

export class Champions {
    lolApi: LolApi
    allChampions: Champion[]
    currentPatch: string | null
    listReady: Promise<any>
    private _championsObserved: boolean

    constructor(lolApi: LolApi) {
        this.lolApi = lolApi
        this.allChampions = []
        this.listReady = this.fetchStaticChampions()
        this._championsObserved = false
        this.currentPatch = null
    }

    private async getCurrentPatch(): Promise<string> {
        if (!this.currentPatch) {
            const patches = (await got('https://ddragon.leagueoflegends.com/api/versions.json').json()) as string[]
            this.currentPatch = patches[0]
        }
        return this.currentPatch!
    }

    private async fetchStaticChampions() {
        this.allChampions = await got(`https://ddragon.leagueoflegends.com/cdn/${await this.getCurrentPatch()}/data/en_US/champion.json`).json()
            .then((r: any) => Object.values(r.data).map((c: any) => new Champion({ id: Number.parseInt(c.key), icon: c.image.full, name: c.id, isPickable: null, isBannable: null })))
    }

    async observeAllChampion(): Promise<any> {
        if (this._championsObserved) return

        this._championsObserved = true
        await this.listReady

        const editChampions = async (champions: number[], key: string) => {
            this.allChampions.forEach(champion => {
                const newVal = { [key]: champions.includes(champion.id) }
                Object.assign(champion, newVal)
            })
        }

        const pickable = new Promise(res => this.lolApi.observe(
            '/lol-champ-select/v1/pickable-champion-ids',
            async r => {
                await editChampions(r, 'isPickable')
                res()
            }
        ))

        const bannable = new Promise(res => this.lolApi.observe(
            '/lol-champ-select/v1/bannable-champion-ids',
            async r => {
                await editChampions(r, 'isBannable')
                res()
            }
        ))

        return Promise.all([pickable, bannable])
    }

    async findChampion(param: string): Promise<Champion | undefined> {
        await this.listReady
        return this.allChampions.find(({ name }) => name === param)
    }
}

interface IAction {
    id: number
    type: 'pick' | 'ban'
    completed: boolean
    actorCellId: number
    championId: string
    isAllyAction: boolean
    isInProgress: boolean
}

export class Action {
    static TYPES = {
        PICK: 'pick',
        BAN: 'ban'
    }

    id: number
    type: 'pick' | 'ban'
    completed: boolean
    actorCellId: number
    championId: string
    isAllyAction: boolean

    constructor(a: IAction) {
        this.id = a.id
        this.type = a.type
        this.completed = a.completed
        this.actorCellId = a.actorCellId
        this.championId = a.championId
        this.isAllyAction = a.isAllyAction
    }
}

export class Turn {
    isInProgress: boolean
    actions: Action[]

    constructor(actions: IAction[]) {
        this.isInProgress = actions[0].isInProgress
        this.actions = actions.map(a => new Action(a))
    }
}

export class GameLobby {
    static PHASES = {
        PLANNING: 'PLANNING',
        BAN_PICK: 'BAN_PICK',
        FINALIZATION: 'FINALIZATION',
        GAME_STARTING: 'GAME_STARTING'
    }

    static LOL_RESPONSE_POSITIONS: { [key: string]: TBlitxPositions } = {
        top: 'TOP',
        jungle: 'JUNGLE',
        middle: 'MID',
        bottom: 'ADC',
        utility: 'SUPPORT'
    }

    lolApi: LolApi
    turns: Turn[]
    onAction: null | (() => {})
    myCellId: number | null
    myPosition: TBlitxPositions | null
    phase: string | null
    firstTurn: boolean

    constructor(lolApi: LolApi) {
        this.lolApi = lolApi
        this.turns = []
        this.onAction = null
        this.myCellId = null
        this.myPosition = null
        this.phase = null

        this.firstTurn = true
    }

    async waitForGameLobby(): Promise<void> {
        return new Promise((res: (arg0: any) => any) => {
            const obs = this.lolApi.observe(
                '/lol-champ-select/v1/session',
                () => res(obs)
            ).catch(console.warn)
        }).then((obs) => obs.unsubscribe())
    }

    async observeActions(): Promise<{ unsubscribe: () => void }> {
        const onResponse = async ({ actions, localPlayerCellId, timer, myTeam }: { actions: any[], localPlayerCellId: number, timer: { phase: string }, myTeam: any[] }) => {
            this.phase = timer.phase
            const newTurns = actions.map(turn => new Turn(turn))
            this.myCellId = localPlayerCellId
            if (!this.myPosition) {
                const p = myTeam.find(({ cellId }) => cellId === this.myCellId).assignedPosition
                if (p) this.myPosition = GameLobby.LOL_RESPONSE_POSITIONS[p]
            }
            this.turns = newTurns
            if (this.onAction) this.onAction()
        }

        return this.lolApi.observe(
            '/lol-champ-select/v1/session',
            onResponse
        )
    }

    get currentTurn(): number | null {
        const i = this.turns.findIndex(({ isInProgress }) => isInProgress)
        return i === -1 ? null : i
    }

    get myActionInProgress(): Action | null {
        const turnInProgress = this.turns.find(({ isInProgress }) => isInProgress)
        if (
            turnInProgress && [GameLobby.PHASES.BAN_PICK, GameLobby.PHASES.PLANNING].includes(this.phase!)
        ) return turnInProgress.actions.find(({ completed, actorCellId }) => !completed && actorCellId === this.myCellId)!
        else return null
    }

    async pickChampion(champion: Champion, action: Action, doCompletion: boolean = true): Promise<any> {
        return this.lolApi.request(`/lol-champ-select/v1/session/actions/${action.id}`, 'PATCH', { championId: champion.id }).then(async pick => {
            if (pick.errorCode) {
                throw new Error(JSON.stringify(pick))
            }
            let completed = null
            if (doCompletion) {
                completed = await this.lolApi.request(`/lol-champ-select/v1/session/actions/${action.id}/complete`, 'POST', {})
            }
            return { pick, completed }
        })
    }

    async banChampion(champion: Champion, action: Action): Promise<any> {
        return this.pickChampion(champion, action)
    }

    get firstUncompletedPickAction(): Action | undefined {
        const allActions = Array.prototype.concat(...this.turns.map(t => t.actions))
        return allActions.filter(x => x.type === "pick" && x.actorCellId === this.myCellId && !x.completed)[0];
    }

}

export type PartyLobbyPosition = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY'
export type PartyLobbyGameMode = 'FLEX' | 'SOLOQ' | 'NORMAL' | 'ARAM'

interface IPickedPositions {
    firstPosition: PartyLobbyPosition
    secondPosition: PartyLobbyPosition
}


export class PartyLobby {
    static POSITIONS: { [key: string]: string } = {
        TOP: 'TOP',
        JUNGLE: 'JUNGLE',
        MID: 'MIDDLE',
        ADC: 'BOTTOM',
        SUPPORT: 'UTILITY'
    }

    static GAME_MODES: { [key: string]: PartyLobbyGameMode } = {
        FLEX: 'FLEX',
        SOLOQ: 'SOLOQ',
        NORMAL: 'NORMAL',
        ARAM: 'ARAM'
    }

    lolApi: LolApi

    constructor(lolApi: LolApi) {
        this.lolApi = lolApi
    }

    goQueue(position: PartyLobbyGameMode): Promise<any> {
        const body = {
            FLEX: { queueId: 440 },
            SOLOQ: { queueId: 420 },
            NORMAL: { queueId: 400 },
            ARAM: { queueId: 450 }
        }[position]
        return this.lolApi.request('/lol-lobby/v2/lobby', 'POST', body)
    }

    pickPositions({ firstPosition, secondPosition }: IPickedPositions): Promise<any> {
        const body = {
            firstPreference: firstPosition,
            secondPreference: secondPosition
        }
        return this.lolApi.request('/lol-lobby/v2/lobby/members/localMember/position-preferences', 'PUT', body)
    }

    searchGame(): Promise<any> {
        return this.lolApi.request('/lol-lobby/v2/lobby/matchmaking/search', 'POST')
    }

    acceptGame(): Promise<any> {
        return this.lolApi.request('/lol-matchmaking/v1/ready-check/accept', 'POST')
    }

    waitToFind(): Promise<any> {
        return new Promise(res => {
            const obs = this.lolApi.observe('/lol-matchmaking/v1/search', async r => {
                if (r && r.searchState === 'Found') res(obs)
            })
        }).then((obs: any) => obs.unsubscribe())
    }
}

export class RunePage {
    static RUNE_PAGE_NAME = 'DON\'T EDIT THIS PAGE'
    static STYLE_IDS: { [key: string]: number } = {
        PRECISION: 8000,
        DOMINATION: 8100,
        SORCERY: 8200,
        RESOLVE: 8400,
        INSPIRATION: 8300
    }

    lolApi: LolApi
    private _workingPageObject: {} | null
    private _allRunes: { [key: string]: number } | null

    constructor(lolApi: LolApi) {
        this.lolApi = lolApi
        this._workingPageObject = null
        this._allRunes = null
    }

    async getAllRunes(): Promise<{ [key: string]: number }> {
        if (!this._allRunes) {
            this._allRunes = await this.lolApi.request(
                '/lol-perks/v1/perks',
                'GET',
            ).then(r => r.map(({ id, name }: { id: number, name: string }) => ({ id, name: normalize(name) }))
            ).then(r => r.reduce(
                (a: { [key: string]: number }, r: { id: number, name: string }) => Object.assign({}, a, { [r.name]: r.id }),
                {} as { [key: string]: number }
            ))
        }
        return this._allRunes!
    }

    private async getRunePage(): Promise<{ id: string, [key: string]: string }> {
        if (!this._workingPageObject) {
            const allPages = await this.lolApi.request(
                '/lol-perks/v1/pages',
                'GET',
            )
            let page = allPages.find(({ name }: { name: string }) => name === RunePage.RUNE_PAGE_NAME)
            if (!page) {
                page = allPages.reduce((a: any, r: any) => a === null ? (r.isEditable ? r : null) : (r.isEditable && r.isValid ? r : a), null)
                if (page === null) throw new Error('Cannot find an available rune page to use')
                page = Object.assign({}, page, { name: RunePage.RUNE_PAGE_NAME })
                await this.lolApi.request(
                    `/lol-perks/v1/pages/${page.id}`,
                    'PUT',
                    page
                )
            }

            this._workingPageObject = page
        }

        return this._workingPageObject as { id: string }
    }

    async selectRunePage(): Promise<any> {
        return this.lolApi.request(
            '/lol-perks/v1/currentpage',
            'PUT',
            (await this.getRunePage()).id
        )
    }

    async editRunes(runesIds: IRunePage): Promise<any> {
        this._workingPageObject = Object.assign({}, await this.getRunePage(), runesIds)
        return this.lolApi.request(
            `/lol-perks/v1/pages/${(await this.getRunePage()).id}`,
            'PUT',
            await this.getRunePage()
        )
    }
}

interface IRunePage {
    primaryStyleId: number
    subStyleId: number
    selectedPerkIds: number[]
}

interface IChampionGgRunePage {
    PRIMARY_STYLE: string
    SECONDARY_STYLE: string
    PRIMARY_RUNES: string[]
    SECONDARY_RUNES: string[]
    SHARD_RUNES: string[]
}

export type ChampionGgPosition = 'Top' | 'Jungle' | 'Middle' | 'ADC' | 'Support'

export class ChampionGg {
    static BASE_URL = 'https://champion.gg/champion'
    static POSITIONS: { [key: string]: ChampionGgPosition } = {
        TOP: 'Top',
        JUNGLE: 'Jungle',
        MID: 'Middle',
        ADC: 'ADC',
        SUPPORT: 'Support'
    }

    static async getRunes(championName: string, position: ChampionGgPosition): Promise<IChampionGgRunePage> {
        const url = `${ChampionGg.BASE_URL}/${championName}/${position}`
        const html = await got(url).then(r => r.body)
        const $ = cheerio.load(html)
        const title = $('h2.champion-stats').toArray().find(e => $(e).text() === 'Highest Win % Runes')
        const runeContainer = $(title!.parent).find('.o-wrap #app')

        const leftColumn = runeContainer.find('#primary-path div[class^=Slot__RightSide] > div:not([class]) > div > div').map((i, e) => $(e).text()).toArray()
        const rightColumn = runeContainer.find('#secondary-path div[class^=Slot__RightSide] > div[class^=Description] > div').map((i, e) => $(e).text()).toArray()
        const PRIMARY_STYLE = normalize(runeContainer.find('#primary-path div[class^=Slot__RightSide] > div[class^=Description] > div').text())
        const SECONDARY_STYLE = normalize(runeContainer.find('#secondary-path div[class^=Slot__RightSide] > div:not([class]) > div > div').text())
        const PRIMARY_RUNES = leftColumn.map(e => normalize($(e).text()))
        const SECONDARY_RUNES = rightColumn.slice(0, 2).map(e => normalize($(e).text()))
        const SHARD_RUNES = rightColumn.slice(2).map(e => normalize($(e).text())).map(rn => {
            const adapted = ({
                ADAPTIVEFORCE: 'ADAPTIVE',
                MAGICRESIST: 'MAGICRES',
                SCALINGCOOLDOWNREDUCTION: 'CDRSCALING',
                SCALINGHEALTH: 'HEALTHSCALING'
            } as any)[rn]
            return adapted || rn
        })
        return { PRIMARY_STYLE, SECONDARY_STYLE, PRIMARY_RUNES, SECONDARY_RUNES, SHARD_RUNES }
    }

    static formatRunes(runes: IChampionGgRunePage, allRunes: { [key: string]: number }): IRunePage {
        const newRunes = {} as IRunePage
        newRunes.primaryStyleId = RunePage.STYLE_IDS[runes.PRIMARY_STYLE]
        newRunes.subStyleId = RunePage.STYLE_IDS[runes.SECONDARY_STYLE]
        newRunes.selectedPerkIds = [...runes.PRIMARY_RUNES, ...runes.SECONDARY_RUNES, ...runes.SHARD_RUNES].map(rn => {
            const runeId = allRunes[rn]
            if (!runeId) {
                throw new Error(`Unknown rune ${rn} ${JSON.stringify(runes)}`)
            } else return runeId
        })
        return newRunes
    }
}
