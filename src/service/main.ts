import { Champion, Champions, Action, GameLobby, PartyLobby, PartyLobbyGameMode, RunePage, ChampionGg, PartyLobbyPosition, Summoners } from './classes'; // eslint-disable-line no-unused-vars
import * as errors from './errors';
import { Config, LanePreference } from '../config';
import { HTTPError } from 'got/dist/source';

const sleep = t => new Promise(res => setTimeout(res, t))

function errorIsChampionAlreadyUsed(e: any) {
    try {
        const m = JSON.parse(e.response.body).message
        if (m.includes('is currently banned in game') || m.includes('is currently banned in game')) {
            return true
        } else return false
    } catch { return false }
}


export async function run(
    config: Config,
    { champions, rune, lobby, gameLobby, summoners }: { champions: Champions, rune: RunePage, lobby: PartyLobby, gameLobby: GameLobby, summoners: Summoners }
) {

    async function autolobby() {
        const gm = PartyLobby.GAME_MODES[config.preferredGameMode]
        if (!gm) throw new errors.MissingGameModeError()
        else return lobby.goQueue(gm)
    }

    async function autoposition() {
        const pp = PartyLobby.POSITIONS[config.primaryPosition]
        const sp = PartyLobby.POSITIONS[config.secondaryPosition]
        if (!pp || !sp) throw new errors.MissingPositionError(`Primary: ${pp} | Secondary: ${sp}`)
        else return lobby.pickPositions({ firstPosition: pp, secondPosition: sp })

    }

    async function autosearch() {
        return lobby.searchGame()
    }

    async function autoaccept(): Promise<() => void> {
        const observer = await lobby.observeSearchStatus()
        while (true) { // eslint-disable-line no-constant-condition
            console.log(lobby.currentSearchState)
            if (lobby.currentSearchState === PartyLobby.SEARCH_STATUSES.FOUND) {
                console.log('Game found, accepting')
                await lobby.acceptGame()
                console.log('Game accepted, waiting for game lobby or declination')
                while (!(await gameLobby.isInGameLobby())) {
                    console.log('Not in game lobby')
                    await sleep(1000)
                    if (lobby.currentSearchState === PartyLobby.SEARCH_STATUSES.SEARCHING) {
                        console.log('Back to searching state. Someone declined?')
                        break
                    }
                }
                if (await gameLobby.isInGameLobby()) {
                    console.log('Went to game lobby')
                    break
                } else console.log('Someone declined. Trying again')
            }
            await sleep(1000)
        }
        return observer
    }

    async function autodeclare(pref: LanePreference): Promise<() => void> {
        const championsToPick = pref.pick.slice(0)
        if (!championsToPick || championsToPick.length === 0) throw new errors.NoChampionToPickError()

        const actionsCompleted: number[] = []

        const removeActionHandler = gameLobby.addOnActionHandler(async () => {
            if (gameLobby.phase !== GameLobby.PHASES.PLANNING) return
            if (!gameLobby.firstUncompletedPickAction) return
            if (actionsCompleted.includes(gameLobby.firstUncompletedPickAction.id)) return
            actionsCompleted.push(gameLobby.firstUncompletedPickAction.id)
            console.log('New declare action:', gameLobby.firstUncompletedPickAction)

            if (championsToPick.length === 0) throw new errors.NoChampionToPickError()

            let champion: Champion | null = null

            while (!champion && championsToPick.length > 0) {
                const tempChampion = await champions.findChampion(championsToPick.shift()!)
                if (tempChampion && tempChampion.isBannable) champion = tempChampion
            }

            if (!champion) throw new errors.CannotFindChampionError()
            await gameLobby.pickChampion(champion, gameLobby.firstUncompletedPickAction!, false).catch(e => {
                console.error('Unexpected error while declaring', { e, body: e?.response?.body })
                throw e
            })
        })

        return removeActionHandler
    }

    async function autoban(pref: LanePreference): Promise<() => void> {
        console.log('autoban')
        const championsToBan = pref.ban.slice(0)
        if (!championsToBan || championsToBan.length === 0) throw new errors.NoChampionToBanError()

        const actionsCompleted: number[] = []

        const removeActionHandler = gameLobby.addOnActionHandler(async () => {
            if (gameLobby.phase !== GameLobby.PHASES.BAN_PICK) return
            const action = gameLobby.myActionInProgress
            if (!action || action.type !== Action.TYPES.BAN) return

            if (actionsCompleted.includes(action.id)) return
            actionsCompleted.push(action.id)
            console.log('New ban action:', action)

            if (championsToBan.length === 0) throw new errors.NoChampionToBanError()
            let champion: Champion | null = null

            while (!champion && championsToBan.length > 0) {
                const tempChampion = await champions.findChampion(championsToBan.shift()!)
                if (tempChampion && !gameLobby.myTeamDeclaredChampionIds.includes(tempChampion.id)) champion = tempChampion
                if (!champion) continue
                await gameLobby.banChampion(champion, action).catch(e => {
                    if (errorIsChampionAlreadyUsed(e)) champion = null
                    else {
                        console.error('Unexpected error while banning', { e, body: e?.response?.body })
                        throw e
                    }
                })
            }

            if (!champion) throw new errors.CannotFindBannableChampionError()
        })

        return removeActionHandler
    }

    async function autopick(pref: LanePreference): Promise<() => void> {
        const championsToPick = pref.pick.slice(0)
        if (!championsToPick || championsToPick.length === 0) throw new errors.NoChampionToPickError()

        const actionsCompleted: number[] = []

        const removeActionHandler = gameLobby.addOnActionHandler(async () => {
            if (gameLobby.phase !== GameLobby.PHASES.BAN_PICK) return

            const action = gameLobby.myActionInProgress
            if (!action || action.type !== Action.TYPES.PICK) return

            if (actionsCompleted.includes(action.id)) return
            actionsCompleted.push(action.id)

            console.log('New pick action:', action)

            if (championsToPick.length === 0) throw new errors.NoChampionToPickError()
            let champion: Champion | null = null

            while (!champion && championsToPick.length > 0) {
                const tempChampion = await champions.findChampion(championsToPick.shift()!)
                if (tempChampion && !gameLobby.bannedChampions.includes(tempChampion.id)) champion = tempChampion
                if (!champion) continue
                await gameLobby.pickChampion(champion, action).catch(e => {
                    if (errorIsChampionAlreadyUsed(e)) champion = null
                    else if (e?.response?.statusCode === 500) champion = null
                    else {
                        console.error('Unexpected error while picking', { e, body: e?.response?.body })
                        throw e
                    }
                })
            }

            if (!champion) throw new errors.CannotFindPickableChampionError()
        })

        return removeActionHandler
    }

    async function autorunes(): Promise<() => void> {
        let runesHandled = false

        const removeActionHandler = gameLobby.addOnActionHandler(async () => {
            if (gameLobby.phase !== GameLobby.PHASES.FINALIZATION) return
            if (runesHandled) return
            runesHandled = true

            const allRunes = await rune.getAllRunes()
            if (!gameLobby.myPlayer || !gameLobby.myPlayer.championId) return console.warn('Cannot get your selected champion', gameLobby.myPlayer)

            const championName = champions.allChampions.find(c => c.id === gameLobby.myPlayer!.championId)!.name!

            try {
                const desiredRunes = await ChampionGg.getRunes(championName, ChampionGg.POSITIONS[gameLobby.myPosition || config.primaryPosition])
                const newRunes = ChampionGg.formatRunes(desiredRunes, allRunes)

                await rune.editRunes(newRunes)
                await rune.selectRunePage()
            } catch (error) {
                console.error('Could not get/set runes', error) // TODO usar debug.ts para ver por que no se cogen bien las runas de champion gg
            }
        })

        return removeActionHandler
    }

    async function autosummoners(pref: LanePreference): Promise<() => void> {
        let summonersHandled = false

        const removeActionHandler = gameLobby.addOnActionHandler(async () => {
            if (gameLobby.phase !== GameLobby.PHASES.FINALIZATION) return
            if (summonersHandled) return
            summonersHandled = true

            await summoners.ready
            if (!pref.summoners || !pref.summoners.first || !pref.summoners.second) throw new errors.MissingSummonersError(JSON.stringify(pref))
            await summoners.selectSummoners(pref.summoners.first, pref.summoners.second)
        })

        return removeActionHandler
    }

    async function waitGameStart(): Promise<void> {
        const removeActionHandler: any = await new Promise(async res => {
            let handled = false
            const removeActionHandler = gameLobby.addOnActionHandler(async () => {
                if (gameLobby.phase !== GameLobby.PHASES.GAME_STARTING) return
                if (handled) return
                handled = true
                res(removeActionHandler)
            })
        });
        return removeActionHandler();
    }


    config.readConfig()

    if (config.autolobby) {
        if (!(await lobby.isInLobby()) && !(await gameLobby.isInGameLobby())) {
            console.log('autolobby')
            await autolobby()
        }
    }

    if (config.autoposition || config.autosearch || config.autoaccept) {
        if (!(await gameLobby.isInGameLobby())) {
            console.log('autoposition')
            if (config.autoposition) await autoposition()
            console.log('autosearch')
            if (config.autosearch) await autosearch()
            console.log('autoaccept')
            if (config.autoaccept) await autoaccept()
        }
    }

    if (config.autodeclare || config.autoban || config.autopick || config.autorunes || config.autosummoners) {
        if (await gameLobby.isInGameLobby()) {
            console.log('waitForGameLobby')
            await gameLobby.waitForGameLobby()
            console.log('observeActions')
            const actionObserver = await gameLobby.observeActions()
            console.log('observeAllChampion')
            const championsOberver = await champions.observeAllChampion()

            console.log('pref')
            const pref = config.lanePreferences.find(({ lane }) => lane === (gameLobby.myPosition || config.primaryPosition))!
            if (!pref) throw new errors.MisingLanePreferenceError(JSON.stringify(config.lanePreferences));

            const gameLobbyPromises: Promise<(() => void) | void>[] = []
            console.log('autodeclare')
            if (config.autodeclare) gameLobbyPromises.push(autodeclare(pref))
            console.log('autoban')
            if (config.autoban) gameLobbyPromises.push(autoban(pref))
            console.log('autopick')
            if (config.autopick) gameLobbyPromises.push(autopick(pref))
            console.log('autorunes')
            if (config.autorunes) gameLobbyPromises.push(autorunes())
            console.log('autosummoners')
            if (config.autosummoners) gameLobbyPromises.push(autosummoners(pref))

            console.log('stopHandlers')
            const stopHandlers = await Promise.all(gameLobbyPromises)
            console.log('waitGameStart')
            await waitGameStart()
            console.log('Game started')
            stopHandlers.forEach(f => f && f())
            console.log('Handlers stopped')
            actionObserver.unsubscribe()
            console.log('actionObserver.unsubscribe')
            championsOberver.forEach(obs => obs.unsubscribe())
            console.log('championsOberver.unsubscribe')
        }
    }

}
