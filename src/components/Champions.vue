<template>
    <div>
        <fieldset
            class="mt-4"
            v-for="{ positionName, attributeName } in interfaceBuilder"
            :key="positionName"
        >
            <legend>{{ positionName }} position</legend>
            <div>
                <fieldset>
                    <legend>Position</legend>
                    <select
                        :value="selectedPositions[attributeName]"
                        @change="onPositionChange(attributeName, $event)"
                    >
                        <option
                            v-for="position in positions"
                            :key="position.value"
                            :value="position.value"
                            >{{ position.text }}</option
                        >
                    </select>
                </fieldset>

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

import { BlitxPositions, TBlitxPositions, Champion } from '../service/classes';
import { Config } from '../config';
import ChampionSelector from './champions/ChampionSelector.vue';

@Component({
    components: {
        'champion-selector': ChampionSelector
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

    positions = Object.keys(BlitxPositions).map(p => ({
        text:
            p === BlitxPositions.ADC
                ? p
                : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
        value: p
    }));

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

    get config(): Config {
        return this.$root.$data.config;
    }

    onPositionChange(attributeName: 'primary' | 'secondary', event) {
        this.config[`${attributeName}Position`] = this.selectedPositions[
            attributeName
        ];
        this.saveConfig().then(() => this.readChampionPreferences());
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

    saveConfig() {
        if (this.selectedPositions.primary)
            this.config.primaryPosition = this.selectedPositions.primary;
        if (this.selectedPositions.secondary)
            this.config.secondaryPosition = this.selectedPositions.secondary;

        ['primary', 'secondary'].forEach(pos => {
            if (!this.selectedPositions[pos]) return;

            const index = this.config.lanePreferences.findIndex(
                p => p.lane === this.selectedPositions[pos]
            );
            const laneChampions = {
                lane: this.selectedPositions[pos],
                pick: this.pickChampions[pos].filter(Boolean).map(c => c!.name),
                ban: this.banChampions[pos].filter(Boolean).map(c => c!.name)
            };
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
            const lane = this.config.lanePreferences.find(
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
            this.$set(this.pickChampions, pos, newPicks[pos]);
            this.$set(this.banChampions, pos, newBans[pos]);
            this.$set(this.pickChampions, pos, newPicks[pos]);
            this.$set(this.banChampions, pos, newBans[pos]);
        });
    }
}
</script>
