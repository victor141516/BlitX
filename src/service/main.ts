import { Champion, Champions, Action, GameLobby, PartyLobby, PartyLobbyGameMode, RunePage, ChampionGg, PartyLobbyPosition, Summoners } from './classes'; // eslint-disable-line no-unused-vars
import * as errors from './errors';
import { Config, LanePreference } from '../config';


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

    async function autoaccept() {
        let stop = false
        // lobby.waitLeaveQueue().then(() => (stop = true))

        while (!stop) {
            try {
                await lobby.waitToFind()
                await lobby.acceptGame()
            } catch (error) {
                console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@')
                console.log('Error while accepting or waiting to accept')
                console.log('Response:', error?.response?.body)
                console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@')
                stop = true // Temporary fix. waitLeaveQueue is not working
            }
        }
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
                console.error('Unexpected error while declaring', { e, body: e?.responsteae?.body })
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
                if (tempChampion && tempChampion.isBannable) champion = tempChampion
                if (!champion) continue
                await gameLobby.banChampion(champion, action).catch(e => {
                    if (errorIsChampionAlreadyUsed(e)) champion = null
                    else {
                        console.error('Unexpected error while banning', { e, body: e?.responsteae?.body })
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
                if (tempChampion && tempChampion.isPickable) champion = tempChampion
                if (!champion) continue
                await gameLobby.pickChampion(champion, action).catch(e => {
                    if (errorIsChampionAlreadyUsed(e)) champion = null
                    else {
                        console.error('Unexpected error while picking', { e, body: e?.responsteae?.body })
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


    config.readConfig()

    if (!(await lobby.isInLobby()) && !(await gameLobby.isInGameLobby())) {
        if (config.autolobby) await autolobby()
    }

    if (!(await gameLobby.isInGameLobby())) {
        if (config.autoposition) await autoposition()
        if (config.autosearch) await autosearch()
        if (config.autoaccept) await autoaccept()
    }

    if (await gameLobby.isInGameLobby()) {
        if (config.autodeclare || config.autoban || config.autopick || config.autorunes || config.autosummoners) {
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
            console.log('waitLeaveGameLobby')
            await gameLobby.waitLeaveGameLobby()
            stopHandlers.forEach(f => f && f())
            actionObserver.unsubscribe()
            championsOberver.forEach(obs => obs.unsubscribe())
        }
    }

}
