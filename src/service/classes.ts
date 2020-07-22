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
    currentPatch: string | null
    private _websocket: LC.LeagueWebSocket | null

    constructor() {
        this.credentials = undefined
        LC.auth().then((c: LC.Credentials) => (this.credentials = c)).catch(() => { })
        this.currentPatch = null
        this._websocket = null
    }

    async getCurrentPatch(): Promise<string> {
        if (!this.currentPatch) {
            const patches = (await got('https://ddragon.leagueoflegends.com/api/versions.json').json()) as string[]
            this.currentPatch = patches[0]
        }
        return this.currentPatch!
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

    request(url: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET', body?: any): Promise<any> {
        return LC.request({ url, method, body }, this.credentials).then((t: any) => {
            try {
                if (t.status === 204) return {}
                else return t.body ? JSON.parse(t.body) : {}
            } catch {
                console.log(t)
            }
        })
    }

    async observe(url: string, cb: (arg0: any) => any): Promise<{ unsubscribe: () => {} }> {
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
    listReady: Promise<any>
    private _championsObserved: boolean

    constructor(lolApi: LolApi) {
        this.lolApi = lolApi
        this.allChampions = []
        this.listReady = this.fetchStaticChampions()
        this._championsObserved = false
    }

    private async fetchStaticChampions() {
        this.allChampions = await got(`https://ddragon.leagueoflegends.com/cdn/${await this.lolApi.getCurrentPatch()}/data/en_US/champion.json`).json()
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

        const pickable = new Promise(res => {
            const obs = this.lolApi.observe(
                '/lol-champ-select/v1/pickable-champion-ids',
                async r => {
                    await editChampions(r, 'isPickable')
                    res(obs)
                }
            )
        }).catch(() => console.warn('Error while observing /lol-champ-select/v1/pickable-champion-ids'))

        const bannable = new Promise(res => {
            const obs = this.lolApi.observe(
                '/lol-champ-select/v1/bannable-champion-ids',
                async r => {
                    await editChampions(r, 'isBannable')
                    res(obs)
                }
            )
        }).catch(() => console.warn('Error while observing /lol-champ-select/v1/bannable-champion-ids'))

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
    championId: number
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
    championId: number
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

interface IGameLobbyPlayer {
    cellId: number | null
    championId: number | null
    assignedPosition: string
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
    onAction: ((...args: any[]) => any)[]
    myCellId: number | null
    myPlayer: IGameLobbyPlayer | null
    myPosition: TBlitxPositions | null
    myTeam: IGameLobbyPlayer[]
    theirTeam: IGameLobbyPlayer[]
    phase: string | null
    firstTurn: boolean
    bannedChampions: number[]
    declarationActionIds: number[]

    constructor(lolApi: LolApi) {
        this.lolApi = lolApi
        this.turns = []
        this.onAction = []
        this.myCellId = null
        this.myPlayer = null
        this.myPosition = null
        this.myTeam = []
        this.theirTeam = []
        this.phase = null
        this.bannedChampions = []
        this.declarationActionIds = []

        this.firstTurn = true
    }

    addOnActionHandler(f: (...args: any[]) => any) {
        this.onAction.push(f)
        return () => {
            this.onAction = this.onAction.filter(g => g !== f)
        }
    }

    async waitForGameLobby(): Promise<void> {
        return new Promise((res: (arg0: any) => any) => {
            const obs = this.lolApi.observe(
                '/lol-champ-select/v1/session',
                () => res(obs)
            ).catch(() => console.warn('Error while observing /lol-champ-select/v1/session'))
        }).then((obs) => obs.unsubscribe())
    }

    async isInGameLobby(): Promise<boolean> {
        try {
            const r = await this.lolApi.request('/lol-champ-select/v1/session')
            return r && r.myTeam && r.myTeam.filter(x => x.cellId === r.localPlayerCellId)[0] !== undefined
        } catch (error) {
            return false
        }
    }

    async observeActions(): Promise<{ unsubscribe: () => void }> {
        const onResponse = (response: {
            actions: any[],
            localPlayerCellId: number,
            timer: { phase: string },
            myTeam: IGameLobbyPlayer[],
            theirTeam: IGameLobbyPlayer[]
        }) => {
            const { actions, localPlayerCellId, timer, myTeam, theirTeam } = response;
            this.bannedChampions = actions.flat().filter(x => x.type === "ban" && x.completed).map(x => x.championId);
            this.phase = timer.phase
            const newTurns = actions.map(turn => new Turn(turn))
            this.myCellId = localPlayerCellId
            this.myTeam = myTeam
            this.theirTeam = theirTeam

            // console.log('My Team:', JSON.stringify(myTeam, undefined, 2));
            // console.log('Their Team:', JSON.stringify(theirTeam, undefined, 2));

            const myPlayer = this.myTeam.find(p => p.cellId === this.myCellId)
            if (myPlayer) {
                this.myPlayer = myPlayer
                this.myPosition = GameLobby.LOL_RESPONSE_POSITIONS[this.myPlayer.assignedPosition]
            }
            this.turns = newTurns

            if (this.phase !== GameLobby.PHASES.PLANNING && this.firstUncompletedPickAction) {
                this.declarationActionIds = this.turns.find(t => t.actions.includes(this.firstUncompletedPickAction!))!.actions.map(a => a.id)
            }

            this.onAction.forEach(async f => {
                try {
                    f()
                } catch (error) {
                    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ ERROR ON ACTION HANDLER')
                    console.log(error)
                    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ ERROR ON ACTION HANDLER')
                }
            })
        }

        const loopId = setInterval(() => {
            this.lolApi.request('/lol-champ-select/v1/session').then(onResponse).catch(() => { })
        }, 1000)

        return { unsubscribe: () => clearInterval(loopId) }


        // return this.lolApi.observe(
        //     '/lol-champ-select/v1/session',
        //     onResponse
        // ).catch(e => {
        //     console.warn('Error while observing /lol-champ-select/v1/session')
        //     throw e
        // })
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

    get myTeamDeclaredChampionIds(): number[] {
        return this.turns.map(t => t.actions).flat().filter(a => this.declarationActionIds.includes(a.id)).map(a => {
            console.log(a)
            return a.championId
        })
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
        return allActions.filter(x => x.type === 'pick' && x.actorCellId === this.myCellId && !x.completed)[0];
    }

}

export type PartyLobbyPosition = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY'
export type PartyLobbyGameMode = 'FLEX' | 'SOLOQ' | 'NORMAL' | 'ARAM'

interface IPickedPositions {
    firstPosition: PartyLobbyPosition
    secondPosition: PartyLobbyPosition
}


export class PartyLobby {
    static SEARCH_STATUSES: { [key: string]: string } = {
        SEARCHING: 'Searching',
        FOUND: 'Found',
    }

    static POSITIONS: { [key: string]: PartyLobbyPosition } = {
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
    currentSearchState?: string

    constructor(lolApi: LolApi) {
        this.lolApi = lolApi
    }

    async isInLobby(): Promise<boolean> {
        try {
            await this.lolApi.request('/lol-lobby/v2/lobby')
            return true
        } catch {
            return false
        }
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

    async observeSearchStatus(): Promise<() => {}> {
        const obs = this.lolApi.observe('/lol-matchmaking/v1/search', async r => {
            if (r?.searchState) this.currentSearchState = r.searchState
        })
        return obs.then(o => o.unsubscribe)

    }

    waitLeaveQueue(): Promise<any> {
        return new Promise(res => {
            const obs = this.lolApi.observe('/lol-matchmaking/v1/search', async r => {
                console.log('isCurrentlyInQueue:', r.isCurrentlyInQueue)
                if (!r?.isCurrentlyInQueue) res(obs)
            }).catch(() => res(obs))
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

export class Summoner {
    id: number
    name: string
    availableGameModes: string[]

    constructor(data: any) {
        this.id = data.id
        this.name = data.name
        this.availableGameModes = data.gameModes.filter(g => g !== '')
    }
}

export class Summoners {
    lolApi: LolApi
    ready: Promise<any>
    allSummoners: Summoner[]


    constructor(lolApi: LolApi) {
        this.lolApi = lolApi
        this.allSummoners = []
        this.ready = this.fetchSummoners().then(d => (this.allSummoners = d))
    }

    private fetchSummoners(): Promise<Summoner[]> {
        return this.lolApi.request('/lol-game-data/assets/v1/summoner-spells.json').then(ss => ss.filter(ss => ss.name !== '').map(s => new Summoner(s)))
    }

    selectSummoners(firstSummonerName: string, secondSummonerName: string) {
        const spell1Id = this.allSummoners.find(s => s.name === firstSummonerName)!.id
        const spell2Id = this.allSummoners.find(s => s.name === secondSummonerName)!.id
        return this.lolApi.request('/lol-champ-select/v1/session/my-selection', 'PATCH', { spell1Id, spell2Id });
    }
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
        const url = `${ChampionGg.BASE_URL}/${championName}/${position}?league=gold`
        const html = await got(url).then(r => r.body)
        const $ = cheerio.load(html)
        const title = $('h2.champion-stats').toArray().find(e => $(e).text() === 'Highest Win % Runes')
        const runeContainer = $(title!.parent).find('.o-wrap #app')

        const leftColumn = runeContainer.find('#primary-path div[class^=Slot__RightSide] > div:not([class]) > div > div').toArray()
        const rightColumn = runeContainer.find('#secondary-path div[class^=Slot__RightSide] > div[class^=Description] > div').toArray()
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
                throw new Error(`Unknown rune (${rn}) (${JSON.stringify(runes)})`)
            } else return runeId
        })
        return newRunes
    }
}
