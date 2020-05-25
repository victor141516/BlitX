<template>
    <fieldset>
        <div class="field-row">Interface scale factor:</div>
        <div class="field-row">
            <input
                id="1"
                type="radio"
                :value="1"
                v-model="scaleFactor"
                @change="onScaleFactorChange"
                name="scale-factor"
            />
            <label for="1">100%</label>
        </div>
        <div class="field-row">
            <input
                id="1-5"
                type="radio"
                :value="1.5"
                v-model="scaleFactor"
                @change="onScaleFactorChange"
                name="scale-factor"
            />
            <label for="1-5">150%</label>
        </div>
        <div class="field-row">
            <input
                id="2"
                type="radio"
                :value="2"
                v-model="scaleFactor"
                @change="onScaleFactorChange"
                name="scale-factor"
            />
            <label for="2">200%</label>
        </div>
        <div class="field-row">
            <input
                id="2-5"
                type="radio"
                :value="2.5"
                v-model="scaleFactor"
                @change="onScaleFactorChange"
                name="scale-factor"
            />
            <label for="2-5">250%</label>
        </div>
        <div class="field-row">
            <input
                id="3"
                type="radio"
                :value="3"
                v-model="scaleFactor"
                @change="onScaleFactorChange"
                name="scale-factor"
            />
            <label for="3">300%</label>
        </div>
    </fieldset>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class Settings extends Vue {
    scaleFactor = 2;

    beforeMount() {
        this.scaleFactor =
            this.$root.$data.config.scaleFactor || this.scaleFactor;
    }

    onScaleFactorChange() {
        this.$root.$data.config.scaleFactor = this.scaleFactor;
        this.$root.$data.config.writeConfig();
    }
}
</script>
