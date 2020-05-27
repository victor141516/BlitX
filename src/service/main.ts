import { LolApi, Champion, Champions, Action, GameLobby, PartyLobby, PartyLobbyGameMode, RunePage, ChampionGg, PartyLobbyPosition, Summoners } from "./classes"; // eslint-disable-line no-unused-vars
import { Config } from "../config";

const DEBUG = false;

export async function run(
    config: Config,
    { lolApi, champions, rune, lobby, gameLobby, summoners }: { lolApi: LolApi, champions, Champions, rune: RunePage, lobby: PartyLobby, gameLobby: GameLobby, summoners: Summoners }
) {
    config.readConfig()
    if (DEBUG) console.log('Waiting for League of Legends to be open')
    await lolApi.waitForLol()


    if (config.autolobby) {
        if (DEBUG) console.log('Going to queue')
        await lobby.goQueue(PartyLobby.GAME_MODES[config.preferredGameMode] as PartyLobbyGameMode)
    }

    if (config.autoposition) {
        if (DEBUG) console.log('Picking positions')
        await lobby.pickPositions({
            firstPosition: PartyLobby.POSITIONS[config.primaryPosition] as PartyLobbyPosition,
            secondPosition: PartyLobby.POSITIONS[config.secondaryPosition] as PartyLobbyPosition
        })
    }

    if (config.autosearch) {
        if (DEBUG) console.log('Begin search')
        await lobby.searchGame()
    }
    if (config.autoaccept) {
        if (DEBUG) console.log('Waiting to accept')
        await lobby.waitToFind()
        if (DEBUG) console.log('Accepting')
        await lobby.acceptGame()
    }


    let championsToBan: string[] | null = null
    let championsToPick: string[] | null = null
    let championToPick: string | undefined = undefined
    let championToBan: string | undefined = undefined
    let stopObserveActions: null | (() => void) = null

    const DEFAULT_POSITION = 'JUNGLE'

    new Promise(async res => {
        let lastTurn: number | null = null
        let lastPhase: string | null = null

        const onAction = async () => {
            if (gameLobby.phase === GameLobby.PHASES.FINALIZATION) {
                if (stopObserveActions) stopObserveActions()
                return res()
            }
            const pref = config.lanePreferences.find(({ lane }) => lane === gameLobby.myPosition || DEFAULT_POSITION)!
            if (championsToBan === null) {
                championsToBan = pref.ban.slice(0).reverse()
            }

            if (championsToPick === null) {
                championsToPick = pref.pick.slice(0).reverse()
            }

            if (lastTurn === gameLobby.currentTurn && lastPhase === gameLobby.phase) return
            lastTurn = gameLobby.currentTurn
            lastPhase = gameLobby.phase

            if (gameLobby.myCellId === null) return

            const action = gameLobby.myActionInProgress
            if (!action) return


            if (gameLobby.phase === GameLobby.PHASES.PLANNING && config.autodeclare) {
                const champion = (await champions.findChampion(championsToPick![championsToPick!.length - 1]))!
                if (DEBUG) console.log('Declaring now: ', champion.name)
                await gameLobby.pickChampion(champion, gameLobby.firstUncompletedPickAction!, false)
                    .catch(e => console.log('ERROR PLANNING', e, gameLobby.firstUncompletedPickAction, champion))
            } else if (gameLobby.phase === GameLobby.PHASES.BAN_PICK) {
                if (action.type === Action.TYPES.PICK) {
                    if (config.autopick) {

                        let pickCompleted = false

                        while (!pickCompleted && championsToPick.length > 0) {
                            let champion = { isPickable: false } as Champion
                            while (championsToPick.length > 0 && !champion.isPickable) {
                                championToPick = championsToPick!.pop()!
                                champion = await champions.findChampion(championToPick) || champion
                            }

                            if (!champion) { console.error('Could not find a valid champion to pick'); return }
                            if (DEBUG) console.log('Picking now: ', champion.name)
                            await gameLobby.pickChampion(champion, action).then(() => (pickCompleted = true)).catch(e => console.log('ERROR PICKING', e, action, champion))
                        }
                    }
                } else if (action.type === Action.TYPES.BAN) {
                    if (config.autoban && championsToBan!.length > 0) {
                        let banCompleted = false

                        while (!banCompleted && championsToBan.length > 0) {

                            let champion = { isBannable: false } as Champion
                            while (championsToBan.length > 0 && !champion.isBannable) {
                                championToBan = championsToBan!.pop()!
                                champion = await champions.findChampion(championToBan) || champion
                            }

                            if (!champion) { console.error('Could not find a valid champion to ban'); return }
                            if (DEBUG) console.log('Banning now: ', champion.name)
                            await gameLobby.banChampion(champion, action).then(() => (banCompleted = true)).catch(e => console.log('ERROR BANNING', e, action, champion))
                        }
                    }
                } else console.warn('Unknown action type', action)
            } else console.log(`Current phase: ${gameLobby.phase}`)
        }

        if (config.autodeclare || config.autopick || config.autoban) {
            gameLobby.onAction = onAction
            if (DEBUG) console.log('Waiting for champ select phase')
            await gameLobby.waitForGameLobby()
            if (DEBUG) console.log('Updating lobby actions')
            stopObserveActions = await gameLobby.observeActions().then(s => s.unsubscribe)
            if (DEBUG) console.log('Getting champions status...')
            await champions.observeAllChampion()
        }
    }).then(async () => {
        await Promise.all([
            (async () => {
                if (config.autorunes) {
                    if (DEBUG) console.log('Getting all your rune pages')
                    const allRunes = await rune.getAllRunes()

                    if (DEBUG) console.log('Getting optimized runes...')
                    const desiredRunes = await ChampionGg.getRunes(championToPick!, ChampionGg.POSITIONS[gameLobby.myPosition || DEFAULT_POSITION])
                    const newRunes = ChampionGg.formatRunes(desiredRunes, allRunes)
                    if (DEBUG) console.log('Runes obtained:', JSON.stringify(newRunes))

                    if (DEBUG) console.log('Editing runes')
                    await rune.editRunes(newRunes)
                    if (DEBUG) console.log('Selecting runes')
                    await rune.selectRunePage()
                }
            })(),
            (async () => {
                if (config.autosummoners) {
                    await summoners.ready
                    const pref = config.lanePreferences.find(p => p.lane === gameLobby.myPosition || DEFAULT_POSITION)!
                    if (pref.summoners.first && pref.summoners.second) await summoners.selectSummoners(pref.summoners.first, pref.summoners.second)
                }
            })()
        ])
        if (DEBUG) console.log('GL&HF')
    })
}
