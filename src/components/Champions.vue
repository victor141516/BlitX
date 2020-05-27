<template>
    <div>
        <fieldset
            class="mt-4"
            v-for="{ positionName, attributeName } in interfaceBuilder"
            :key="positionName"
        >
            <legend>{{ positionName }} position</legend>
            <div>
                <div class="flex flex-wrap">
                    <fieldset class="flex-1 mr-1">
                        <legend>Position</legend>
                        <select
                            class="mt-1"
                            :value="selectedPositions[attributeName]"
                            @change="onPositionChange(attributeName, $event)"
                        >
                            <option
                                v-for="position in positions[attributeName]"
                                :key="position.value"
                                :value="position.value"
                                >{{ position.text }}</option
                            >
                        </select>
                    </fieldset>
                    <fieldset class="flex-1 ml-1">
                        <legend>Summoner spells</legend>
                        <summoner-selector
                            :selected-summoners="
                                selectedSummoners[attributeName]
                            "
                            @summoner-select="
                                onSummonerSelected(attributeName, $event)
                            "
                        ></summoner-selector>
                    </fieldset>
                </div>

                <fieldset class="mt-2">
                    <legend>Champions to pick</legend>
                    <div class="flex flex-wrap">
                        <champion-selector
                            v-for="(selectedChampion, index) in pickChampions[
                                attributeName
                            ]"
                            :key="
                                selectedChampion
                                    ? selectedChampion.id
                                    : `${attributeName}-pick-null`
                            "
                            :selected-champion="selectedChampion"
                            @champion-select="
                                onChampionSelected(
                                    index,
                                    pickChampions[attributeName],
                                    $event
                                )
                            "
                            @champion-remove="
                                onChampionRemove(
                                    index,
                                    pickChampions[attributeName]
                                )
                            "
                        ></champion-selector>
                    </div>
                </fieldset>

                <fieldset class="mt-2">
                    <legend>Champions to ban</legend>
                    <div class="flex flex-wrap">
                        <champion-selector
                            v-for="(selectedChampion, index) in banChampions[
                                attributeName
                            ]"
                            :key="
                                selectedChampion
                                    ? selectedChampion.id
                                    : `${attributeName}-ban-null`
                            "
                            :selected-champion="selectedChampion"
                            @champion-select="
                                onChampionSelected(
                                    index,
                                    banChampions[attributeName],
                                    $event
                                )
                            "
                            @champion-remove="
                                onChampionRemove(
                                    index,
                                    banChampions[attributeName]
                                )
                            "
                        ></champion-selector>
                    </div>
                </fieldset>
            </div>
        </fieldset>
    </div>
</template>

<script lang="ts">
import got from 'got';
import { Component, Vue } from 'vue-property-decorator';

import {
    BlitxPositions,
    TBlitxPositions,
    Champion,
    Summoner,
    Summoners
} from '../service/classes';
import { Config, LanePreference } from '../config';
import ChampionSelector from './champions/ChampionSelector.vue';
import SummonerSelector from './champions/SummonerSelector.vue';

@Component({
    components: {
        'champion-selector': ChampionSelector,
        'summoner-selector': SummonerSelector
    }
})
export default class Champions extends Vue {
    selectedPositions: {
        primary: TBlitxPositions | null;
        secondary: TBlitxPositions | null;
    } = { primary: null, secondary: null };

    pickChampions: {
        primary: Array<Champion | null>;
        secondary: Array<Champion | null>;
    } = { primary: [null], secondary: [null] };

    banChampions: {
        primary: Array<Champion | null>;
        secondary: Array<Champion | null>;
    } = { primary: [null], secondary: [null] };

    selectedSummoners: {
        primary: { first?: Summoner; second?: Summoner };
        secondary: { first?: Summoner; second?: Summoner };
    } = { primary: {}, secondary: {} };

    interfaceBuilder = [
        {
            positionName: 'Primary',
            attributeName: 'primary'
        },
        {
            positionName: 'Secondary',
            attributeName: 'secondary'
        }
    ];

    beforeMount() {
        ['primary', 'secondary'].forEach(pos => {
            this.$set(
                this.selectedPositions,
                pos,
                this.config[`${pos}Position`]
            );
        });
        this.readChampionPreferences();
    }

    get positions(): { primary: any[]; secondary: any[] } {
        const pos = Object.keys(BlitxPositions).map(p => ({
            text:
                p === BlitxPositions.ADC
                    ? p
                    : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
            value: p
        }));

        const primary = pos.filter(
            p => this.selectedPositions.secondary !== p.value
        );
        const secondary = pos.filter(
            p => this.selectedPositions.primary !== p.value
        );

        return { primary, secondary };
    }

    get config(): Config {
        return this.$root.$data.config;
    }

    onPositionChange(attributeName: 'primary' | 'secondary', event) {
        this.config[`${attributeName}Position`] = this.selectedPositions[
            attributeName
        ];
        const overridePrimary =
            attributeName === 'primary' ? event.target.value : undefined;
        const overrideSecondary =
            attributeName === 'secondary' ? event.target.value : undefined;
        this.saveConfig(overridePrimary, overrideSecondary).then(() =>
            this.readChampionPreferences()
        );
        this.$set(this.selectedPositions, attributeName, event.target.value);
    }

    onChampionSelected(
        index: number,
        championList: Champion[],
        championId: number
    ) {
        const selectedChampion = this.$root.$data.service.champions.allChampions.find(
            c => c.id === championId
        );
        const duplicated = championList.find(c => c && c!.id === championId);
        if (selectedChampion && !duplicated) {
            if (championList[index] === null) {
                this.$set(championList, championList.length, null);
            }
            this.$set(championList, index, selectedChampion);
            this.saveConfig().then(() => this.readChampionPreferences());
        }
    }

    onChampionRemove(index: number, championList: Champion[]) {
        if (championList[index]) {
            this.$delete(championList, index);
            this.saveConfig().then(() => this.readChampionPreferences());
        }
    }

    onSummonerSelected(
        position: 'primary' | 'secondary',
        {
            summonerId,
            summonerOrder
        }: {
            summonerId: number;
            summonerOrder: 'first' | 'second';
        }
    ) {
        const summoners = this.$root.$data.service.summoners as Summoners;
        const selectedSummoner = summoners.allSummoners.find(
            s => s.id === summonerId
        );
        this.$set(
            this.selectedSummoners[position],
            summonerOrder,
            selectedSummoner
        );
        this.saveConfig().then(() => this.readChampionPreferences());
    }

    saveConfig(
        overridePrimaryPosition?: TBlitxPositions,
        overrideSecondaryPosition?: TBlitxPositions
    ) {
        if (this.selectedPositions.primary)
            this.config.primaryPosition = this.selectedPositions.primary;
        if (this.selectedPositions.secondary)
            this.config.secondaryPosition = this.selectedPositions.secondary;

        if (overridePrimaryPosition)
            this.config.primaryPosition = overridePrimaryPosition;
        if (overrideSecondaryPosition)
            this.config.secondaryPosition = overrideSecondaryPosition;

        ['primary', 'secondary'].forEach(pos => {
            if (!this.selectedPositions[pos]) return;

            const index = this.config.lanePreferences.findIndex(
                p => p.lane === this.selectedPositions[pos]
            );

            const summoners: { first?: string; second?: string } = {};
            if (this.selectedSummoners[pos].first)
                summoners.first = this.selectedSummoners[pos].first.name;
            if (this.selectedSummoners[pos].second)
                summoners.second = this.selectedSummoners[pos].second.name;

            const laneChampions = {
                lane: this.selectedPositions[pos],
                pick: this.pickChampions[pos].filter(Boolean).map(c => c!.name),
                ban: this.banChampions[pos].filter(Boolean).map(c => c!.name),
                summoners
            } as LanePreference;

            if (index === -1) this.config.lanePreferences.push(laneChampions);
            else this.config.lanePreferences[index] = laneChampions;
        });

        return this.config.writeConfig();
    }

    readChampionPreferences() {
        let newPicks: {
            primary: Array<Champion | null>;
            secondary: Array<Champion | null>;
        } = {
            primary: [null],
            secondary: [null]
        };

        let newBans: {
            primary: Array<Champion | null>;
            secondary: Array<Champion | null>;
        } = {
            primary: [null],
            secondary: [null]
        };

        ['primary', 'secondary'].forEach(pos => {
            const lane:
                | LanePreference
                | undefined = this.config.lanePreferences.find(
                p => p.lane === this.selectedPositions[pos]
            );

            if (lane) {
                newPicks[pos] = (lane.pick
                    .slice(0)
                    .map(name =>
                        this.$root.$data.service.champions.allChampions.find(
                            c => c.name === name
                        )
                    ) as Array<Champion | null>).concat(null);

                newBans[pos] = (lane.ban
                    .slice(0)
                    .map(name =>
                        this.$root.$data.service.champions.allChampions.find(
                            c => c.name === name
                        )
                    ) as Array<Champion | null>).concat(null);
            }

            const summoners = this.$root.$data.service.summoners as Summoners;
            const summs = {
                first: summoners.allSummoners.find(
                    s => s.name === lane!.summoners?.first
                ),
                second: summoners.allSummoners.find(
                    s => s.name === lane!.summoners?.second
                )
            };

            this.$set(this.pickChampions, pos, newPicks[pos]);
            this.$set(this.banChampions, pos, newBans[pos]);
            this.$set(this.pickChampions, pos, newPicks[pos]);
            this.$set(this.banChampions, pos, newBans[pos]);
            this.$set(this.selectedSummoners, pos, summs);
        });
    }
}
</script>
