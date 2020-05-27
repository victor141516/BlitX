<template>
    <div class="flex flex-wrap" v-if="showAll">
        <div
            class="relative"
            v-for="summonerOrder in ['first', 'second']"
            :key="`${summonerOrder}-summoner`"
        >
            <div
                v-if="showDropdown[summonerOrder]"
                class="summoner-dropdown absolute"
            >
                <div
                    class="summoner-dropdown-row flex items-center"
                    v-for="summoner in summonerList"
                    :key="summoner.id"
                    @click="selectSummoner(summoner.id, summonerOrder)"
                    v-click-outside="closeDropdown(summonerOrder)"
                >
                    <img
                        class="summoner-icon"
                        :src="getIconForSummoner(summoner)"
                    />
                    <span class="ml-2">{{ summoner.name }}</span>
                </div>
            </div>
            <button
                :style="`${buttonStyle[summonerOrder]}`"
                class="summoner-button text-3xl bg-contain"
                @click="showDropdown[summonerOrder] = true"
            >
                {{ selectedSummoners[summonerOrder] ? '' : '+' }}
            </button>
        </div>
    </div>
</template>

<script lang="ts">
import got from 'got';
import { Component, Prop, Vue } from 'vue-property-decorator';
import { Summoner } from '../../service/classes';

@Component
export default class SummonerSelector extends Vue {
    @Prop()
    selectedSummoners!: { first: Summoner; second: Summoner };

    showDropdown = { first: false, second: false };
    showAll = false;
    staticSummoners: { id: number; name: string }[] | null = null;

    beforeMount() {
        this.fetchStaticSummoners();
    }

    get buttonStyle(): { first: string; second: string } {
        return {
            first: this.selectedSummoners.first
                ? `background-image: url("${this.getIconForSummoner(
                      this.selectedSummoners.first
                  )}")`
                : '',
            second: this.selectedSummoners.second
                ? `background-image: url("${this.getIconForSummoner(
                      this.selectedSummoners.second
                  )}")`
                : ''
        };
    }

    get summonerList(): Summoner[] {
        return this.$root.$data.service.summoners.allSummoners;
    }

    async fetchStaticSummoners() {
        const res: any = await got(
            `https://ddragon.leagueoflegends.com/cdn/${this.$root.$data.service.lolApi.currentPatch}/data/en_US/summoner.json`
        ).json();
        this.staticSummoners = Object.values(res.data).map((s: any) => ({
            name: s.id,
            id: Number.parseInt(s.key)
        }));
        this.showAll = true;
    }

    closeDropdown(s) {
        return () => (this.showDropdown[s] = false);
    }

    getIconForSummoner(s: Summoner) {
        const staticSum = this.staticSummoners!.find(st => st.id === s.id)!;
        return `https://ddragon.leagueoflegends.com/cdn/${this.$root.$data.service.lolApi.currentPatch}/img/spell/${staticSum.name}.png`;
    }

    selectSummoner(summonerId: number, summonerOrder: 'first' | 'second') {
        this.showDropdown[summonerOrder] = false;
        this.$emit('summoner-select', { summonerId, summonerOrder });
    }
}
</script>

<style lang="scss" scoped>
$summ-icon-size: 40px;

.summoner-button {
    min-width: 0;
    min-height: 0;
    width: $summ-icon-size;
    height: $summ-icon-size;
    padding-bottom: 2px;
    padding-right: 10px;
}

.summoner-dropdown {
    background-color: white;
    border: 1px solid black;
    height: 3 * $summ-icon-size;
    overflow-y: scroll;
    z-index: 10;
}

.summoner-dropdown-row:hover {
    background-color: navy;
    color: white;
}

.summoner-icon {
    width: $summ-icon-size;
    height: $summ-icon-size;
}
</style>