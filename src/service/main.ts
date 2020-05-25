import { LolApi, Champion, Champions, Action, GameLobby, PartyLobby, PartyLobbyGameMode, RunePage, ChampionGg, PartyLobbyPosition } from "./classes"; // eslint-disable-line no-unused-vars
import { Config } from "../config";

export async function run(config: Config) {
    const lolApi = new LolApi()
    console.log('Waiting for League of Legends to be open')
    await lolApi.waitForLol()

    const champions = new Champions(lolApi)
    const rune = new RunePage(lolApi)
    const lobby = new PartyLobby(lolApi)

    if (config.autolobby) {
        console.log('Going to queue')
        await lobby.goQueue(PartyLobby.GAME_MODES[config.preferredGameType] as PartyLobbyGameMode)
    }

    if (config.autoposition) {
        console.log('Picking positions')
        await lobby.pickPositions({
            firstPosition: PartyLobby.POSITIONS[config.firstLane] as PartyLobbyPosition,
            secondPosition: PartyLobby.POSITIONS[config.secondLane] as PartyLobbyPosition
        })
    }

    if (config.autosearch) {
        console.log('Begin search')
        await lobby.searchGame()
    }
    if (config.autoaccept) {
        console.log('Waiting to accept')
        await lobby.waitToFind()
        console.log('Accepting')
        await lobby.acceptGame()
    }

    const gameLobby = new GameLobby(lolApi)

    let championsToBan: string[] | null = null
    let championsToPick: string[] | null = null
    let championToPick: string | undefined = undefined
    let championToBan: string | undefined = undefined

    new Promise(async res => {
        let lastTurn: number | null = null
        let lastPhase: string | null = null

        gameLobby.onAction = async () => {
            if (championsToBan === null || championsToPick === null) {
                const pref = config.lanePreferences.find(({ lane }) => lane === gameLobby.myPosition || 'SUPPORT')!
                championsToBan = pref.ban.slice(0).reverse()
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
                console.log('Declaring now: ', champion.name)
                await gameLobby.pickChampion(champion, gameLobby.firstUncompletedPickAction!, false)
                    .catch(e => console.log('ERROR PLANNING', e, gameLobby.firstUncompletedPickAction, champion))
            } else if (gameLobby.phase === GameLobby.PHASES.BAN_PICK) {
                if (action.type === Action.TYPES.PICK) {
                    if (config.autopick) {

                        let champion = { isPickable: false } as Champion
                        while (championsToPick.length > 0 && !champion.isPickable) {
                            championToPick = championsToPick!.pop()!
                            champion = await champions.findChampion(championToPick) || champion
                        }

                        if (!champion) { console.error('Could not find a valid champion to pick'); return }
                        console.log('Picking now: ', champion.name)
                        await gameLobby.pickChampion(champion, action).catch(e => console.log('ERROR PICKING', e, action, champion))
                        res()
                    }
                } else if (action.type === Action.TYPES.BAN) {
                    if (config.autoban && championsToBan!.length > 0) {

                        let champion = { isBannable: false } as Champion
                        while (championsToBan.length > 0 && !champion.isBannable) {
                            championToBan = championsToBan!.pop()!
                            champion = await champions.findChampion(championToBan) || champion
                        }

                        if (!champion) { console.error('Could not find a valid champion to ban'); return }
                        console.log('Banning now: ', champion.name)
                        await gameLobby.banChampion(champion, action).catch(e => console.log('ERROR BANNING', e, action, champion))
                    }
                } else console.warn('Unknown action type', action)
            } else console.log(`Current phase: ${gameLobby.phase}`)
        }

        if (config.autodeclare || config.autopick || config.autoban) {
            console.log('Waiting for champ select phase')
            await gameLobby.waitForGameLobby()
            console.log('Updating lobby actions')
            await gameLobby.observeActions()
            console.log('Getting champions status...')
            await champions.observeAllChampion()
        }
    }).then(async () => {
        if (config.autorunes) {
            console.log('Getting all your rune pages')
            const allRunes = await rune.getAllRunes()

            console.log('Getting optimized runes...')
            const desiredRunes = await ChampionGg.getRunes(championToPick!, ChampionGg.POSITIONS[gameLobby.myPosition!])
            const newRunes = ChampionGg.formatRunes(desiredRunes, allRunes)
            console.log('Runes obtained:', JSON.stringify(newRunes))

            console.log('Editing runes')
            await rune.editRunes(newRunes)
            console.log('Selecting runes')
            await rune.selectRunePage()
        }
        console.log('GL&HF')
    })
}
