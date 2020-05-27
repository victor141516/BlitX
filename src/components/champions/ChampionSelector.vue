<template>
    <div class="relative">
        <div v-if="showDropdown" class="champion-dropdown absolute">
            <div
                class="champion-dropdown-row flex items-center"
                v-for="champion in championList"
                :key="champion.id"
                @click="selectChampion(champion.id)"
                v-click-outside="closeDropdown"
            >
                <img
                    class="champion-icon"
                    :src="getIconForChampion(champion)"
                />
                <span class="ml-2">{{ champion.name }}</span>
            </div>
        </div>
        <button
            :style="`${buttonStyle}`"
            class="champion-button text-3xl bg-contain"
            @click="showDropdown = true"
            @click.right.prevent="$emit('champion-remove')"
        >
            {{ selectedChampion === null ? '+' : '' }}
        </button>
    </div>
</template>

<script lang="ts">
import got from 'got';
import { Component, Prop, Vue } from 'vue-property-decorator';
import { Champion } from '../../service/classes';

@Component
export default class ChampionSelector extends Vue {
    @Prop()
    selectedChampion!: null | Champion;

    showDropdown = false;

    get buttonStyle(): string {
        if (this.selectedChampion) {
            return `background-image: url("${this.getIconForChampion(
                this.selectedChampion
            )}")`;
        } else return '';
    }

    get championList(): Champion[] {
        return this.$root.$data.service.champions.allChampions;
    }

    closeDropdown() {
        this.showDropdown = false;
    }

    getIconForChampion(c: Champion) {
        return `http://ddragon.leagueoflegends.com/cdn/${this.$root.$data.service.champions.currentPatch}/img/champion/${c.icon}`;
    }

    selectChampion(championId: number) {
        this.showDropdown = false;
        this.$emit('champion-select', championId);
    }
}
</script>

<style lang="scss" scoped>
$champ-icon-size: 40px;

.champion-button {
    min-width: 0;
    min-height: 0;
    width: $champ-icon-size;
    height: $champ-icon-size;
    padding-bottom: 2px;
    padding-right: 10px;
}

.champion-dropdown {
    background-color: white;
    border: 1px solid black;
    height: 3 * $champ-icon-size;
    overflow-y: scroll;
    z-index: 10;
}

.champion-dropdown-row:hover {
    background-color: navy;
    color: white;
}

.champion-icon {
    width: $champ-icon-size;
    height: $champ-icon-size;
}
</style>