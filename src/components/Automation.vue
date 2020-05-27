<template>
    <fieldset>
        <legend>Automation</legend>
        <div>
            <input
                type="checkbox"
                id="all-checkbox"
                v-model="allChecked"
                @change="onCheckAll"
            />
            <label for="all-checkbox"><b>Check/Uncheck all</b></label>
        </div>
        <div v-for="q in questions" :key="`${q.id}-question`">
            <input
                type="checkbox"
                :id="`${q.id}-checkbox`"
                v-model="$root.$data.config[q.id]"
                @change="onConfigUpdate"
            />
            <label :for="`${q.id}-checkbox`">{{ q.text }}</label>
        </div>
    </fieldset>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

class Question {
    id: string;
    text: string;

    constructor(id: string, text: string) {
        this.id = id;
        this.text = text;
    }
}

@Component
export default class Automation extends Vue {
    allChecked = false;

    questions: Question[] = [
        new Question('autolobby', 'Auto-lobby'),
        new Question('autoposition', 'Auto-position'),
        new Question('autosearch', 'Auto-search'),
        new Question('autoaccept', 'Auto-accept'),
        new Question('autodeclare', 'Auto-declare'),
        new Question('autoban', 'Auto-ban'),
        new Question('autopick', 'Auto-pick'),
        new Question('autorunes', 'Auto-runes')
        // new Question('autosummoners', 'Auto-summoners')
    ];

    beforeMount() {
        this.allChecked = this.questions
            .map(q => q.id)
            .every(id => this.$root.$data.config[id]);
    }

    onConfigUpdate() {
        this.$root.$data.config.writeConfig();
    }

    onCheckAll() {
        this.questions
            .map(q => q.id)
            .forEach(id => {
                this.$root.$data.config[id] = this.allChecked;
            });
        this.$root.$data.config.writeConfig();
    }
}
</script>

<style lang="scss">
</style>
