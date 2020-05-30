import { Champion, Champions, Action, GameLobby, PartyLobby, PartyLobbyGameMode, RunePage, ChampionGg, PartyLobbyPosition, Summoners } from './classes'; // eslint-disable-line no-unused-vars
import * as errors from './errors';
import { Config, LanePreference } from '../config';

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
        lobby.waitLeaveQueue().then(() => (stop = true))

        while (!stop) {
            await lobby.waitToFind()
            await lobby.acceptGame()
        }
    }

    async function autodeclare(pref: LanePreference): Promise<() => void> {
        const championsToPick = pref.pick.slice(0)
        if (!championsToPick || championsToPick.length === 0) throw new errors.NoChampionToPickError()

        let lock = false

        const removeActionHandler = gameLobby.addOnActionHandler(async () => {
            if (lock) return
            if (gameLobby.phase === GameLobby.PHASES.PLANNING) {
                lock = true
                if (championsToPick.length === 0) throw new errors.NoChampionToPickError()

                let champion: Champion | null = null

                while (!champion && championsToPick.length > 0) {
                    const tempChampion = await champions.findChampion(championsToPick.shift()!)
                    if (tempChampion && tempChampion.isBannable) champion = tempChampion
                }

                if (!champion) throw new errors.CannotFindChampionError()
                await gameLobby.pickChampion(champion, gameLobby.firstUncompletedPickAction!, false)

                lock = false
            }
        })

        return removeActionHandler
    }

    async function autoban(pref: LanePreference): Promise<() => void> {
        const championsToBan = pref.ban.slice(0)
        if (!championsToBan || championsToBan.length === 0) throw new errors.NoChampionToBanError()

        let lock = false

        const removeActionHandler = gameLobby.addOnActionHandler(async () => {
            if (lock) return
            if (gameLobby.phase === GameLobby.PHASES.BAN_PICK) {
                lock = true
                const action = gameLobby.myActionInProgress
                if (action && action.type === Action.TYPES.BAN) {
                    if (championsToBan.length === 0) throw new errors.NoChampionToBanError()
                    let champion: Champion | null = null

                    while (!champion && championsToBan.length > 0) {
                        const tempChampion = await champions.findChampion(championsToBan.shift()!)
                        console.log(tempChampion)
                        if (tempChampion && tempChampion.isBannable) champion = tempChampion
                    }

                    // if (!champion) throw new errors.CannotFindBannableChampionError()
                    if (champion) await gameLobby.banChampion(champion, action).then(r => {
                        console.log('###############################')
                        console.log(r)
                        console.log('###############################')
                    })
                    lock = false
                }
            }
        })

        return removeActionHandler
    }

    async function autopick(pref: LanePreference): Promise<() => void> {
        const championsToPick = pref.pick.slice(0)
        if (!championsToPick || championsToPick.length === 0) throw new errors.NoChampionToPickError()

        let lock = false

        const removeActionHandler = gameLobby.addOnActionHandler(async () => {
            if (lock) return

            if (gameLobby.phase === GameLobby.PHASES.BAN_PICK) {
                const action = gameLobby.myActionInProgress
                if (action && action.type === Action.TYPES.PICK) {
                    lock = true

                    if (championsToPick.length === 0) throw new errors.NoChampionToPickError()
                    let champion: Champion | null = null

                    while (!champion && championsToPick.length > 0) {
                        const tempChampion = await champions.findChampion(championsToPick.shift()!)
                        if (tempChampion && tempChampion.isPickable) champion = tempChampion
                    }

                    if (!champion) throw new errors.CannotFindBannableChampionError()
                    await gameLobby.pickChampion(champion, action)
                    lock = false
                }
            }
        })

        return removeActionHandler
    }

    async function autorunes(): Promise<() => void> {
        const removeActionHandler = gameLobby.addOnActionHandler(async () => {
            if (gameLobby.phase === GameLobby.PHASES.FINALIZATION) {
                const allRunes = await rune.getAllRunes()
                if (!gameLobby.myPlayer || !gameLobby.myPlayer.championId) return console.warn('Cannot get your selected champion', gameLobby.myPlayer)

                const desiredRunes = await ChampionGg.getRunes(gameLobby.myPlayer.championId, ChampionGg.POSITIONS[gameLobby.myPosition || config.primaryPosition])
                const newRunes = ChampionGg.formatRunes(desiredRunes, allRunes)

                await rune.editRunes(newRunes)
                await rune.selectRunePage()
            }
        })

        return removeActionHandler
    }

    async function autosummoners(pref: LanePreference): Promise<() => void> {
        const removeActionHandler = gameLobby.addOnActionHandler(async () => {
            if (gameLobby.phase === GameLobby.PHASES.FINALIZATION) {

                await summoners.ready
                if (!pref.summoners || !pref.summoners.first || !pref.summoners.second) throw new errors.MissingSummonersError(JSON.stringify(pref))
                await summoners.selectSummoners(pref.summoners.first, pref.summoners.second)
            }
        })

        return removeActionHandler
    }


    config.readConfig()

    if (config.autolobby) await autolobby()
    if (config.autoposition) await autoposition()
    if (config.autosearch) await autosearch()
    if (config.autoaccept) await autoaccept()


    if (config.autodeclare || config.autoban || config.autopick || config.autorunes || config.autosummoners) {
        const championsOberver = await champions.observeAllChampion()
        const actionObserver = await gameLobby.observeActions()

        const pref = config.lanePreferences.find(({ lane }) => lane === (gameLobby.myPosition || config.primaryPosition))!
        if (!pref) throw new errors.MisingLanePreferenceError(JSON.stringify(config.lanePreferences));

        const gameLobbyPromises: Promise<(() => void) | void>[] = []
        if (config.autodeclare) gameLobbyPromises.push(autodeclare(pref))
        if (config.autoban) gameLobbyPromises.push(autoban(pref))
        if (config.autopick) gameLobbyPromises.push(autopick(pref))
        if (config.autorunes) gameLobbyPromises.push(autorunes())
        if (config.autosummoners) gameLobbyPromises.push(autosummoners(pref))

        const stopHandlers = await Promise.all(gameLobbyPromises)
        await gameLobby.waitLeaveGameLobby()
        stopHandlers.forEach(f => f && f())
        actionObserver.unsubscribe()
        championsOberver.unsubscribe()
    }
}
