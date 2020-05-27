<template>
    <div class="window" :style="windowStyle">
        <div class="title-bar">
            <div class="title-bar-text">
                BlitX
            </div>
            <div class="title-bar-controls">
                <button aria-label="Minimize" @click="minimize"></button>
                <button
                    aria-label="Settings"
                    @click="showSettings = !showSettings"
                ></button>
                <button aria-label="Close" @click="close"></button>
            </div>
        </div>
        <div class="frame" :style="frameStyle">
            <div class="window-body">
                <p v-if="!$root.$data.config.isValid" style="color: red;">
                    Config not valid!!
                </p>
                <settings v-if="showSettings"></settings>
                <template v-else>
                    <button
                        class="mb-2"
                        @click="startService"
                        :disabled="startButtonDisabled"
                    >
                        Start
                    </button>
                    <automation></automation>
                    <champions v-if="showChampions"></champions>
                </template>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { remote } from 'electron';

import { WINDOW_HEIGHT, WINDOW_WIDTH } from './constants';
import Automation from './components/Automation.vue';
import Champions from './components/Champions.vue';
import Settings from './components/Settings.vue';
import * as backend from './service/main';

@Component({
    components: {
        automation: Automation,
        champions: Champions,
        settings: Settings
    }
})
export default class App extends Vue {
    electronRemote: Electron.BrowserWindow = remote.getCurrentWindow();
    showSettings = false;
    showChampions = false;
    startButtonDisabled = false;

    beforeMount() {
        this.$root.$data.service.champions.listReady.then(() =>
            this.$root.$data.service.summoners.ready.then(
                () => (this.showChampions = true)
            )
        );
    }

    get windowStyle() {
        const offset = -6;

        const topLeftValues: { [key: string]: number } = {
            '1': 0,
            '1.5': 16.66666,
            '2': 25,
            '2.5': 30,
            '3': 33.33333
        };

        const topValue =
            topLeftValues[this.$root.$data.config.scaleFactor.toString()];
        const leftValue =
            topLeftValues[this.$root.$data.config.scaleFactor.toString()];
        const widthValue =
            WINDOW_WIDTH / this.$root.$data.config.scaleFactor + offset;
        const heightValue =
            WINDOW_HEIGHT / this.$root.$data.config.scaleFactor + offset;
        const transformValue = this.$root.$data.config.scaleFactor;

        return `height: ${Math.ceil(heightValue)}px; width: ${Math.ceil(
            widthValue
        )}px; transform: scale(${transformValue}); top: ${topValue}%; left: ${leftValue}%;`;
    }

    get frameStyle() {
        const heightValue =
            WINDOW_HEIGHT / this.$root.$data.config.scaleFactor - 25;
        return `height: ${Math.ceil(heightValue)}px;`;
    }

    minimize() {
        this.electronRemote.minimize();
    }

    close() {
        this.electronRemote.close();
    }

    startService() {
        this.startButtonDisabled = true;
        backend
            .run(this.$root.$data.config, this.$root.$data.service)
            .then(() => (this.startButtonDisabled = false))
            .catch(console.error);
    }

    // async runService() {
    //     const loop = () =>
    //         backend
    //             .run(this.$root.$data.config, this.$root.$data.service)
    //             .catch(console.error);

    //     await loop();
    //     while (this.$root.$data.config.isValid) {
    //         await new Promise(res =>
    //             setTimeout(async () => res(await loop()), 5000)
    //         );
    //     }
    // }

    // mounted() {
    //     this.runService();
    // }
}
</script>

<style lang="scss">
body {
    overflow: hidden;
    scrollbar-width: none;
    margin: 0;

    -webkit-touch-callout: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
}

.window {
    position: absolute;

    & > .title-bar > .title-bar-controls > button[aria-label='Settings'] {
        background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAC4jAAAuIwF4pT92AAAGWWlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDggNzkuMTY0MDM2LCAyMDE5LzA4LzEzLTAxOjA2OjU3ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjEuMCAoV2luZG93cykiIHhtcDpDcmVhdGVEYXRlPSIyMDIwLTA1LTI0VDE3OjUxOjQ2KzAyOjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAyMC0wNS0yNFQxODoyMDo0NSswMjowMCIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyMC0wNS0yNFQxODoyMDo0NSswMjowMCIgZGM6Zm9ybWF0PSJpbWFnZS9wbmciIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiIHBob3Rvc2hvcDpJQ0NQcm9maWxlPSJzUkdCIElFQzYxOTY2LTIuMSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDoxYTEwYjc4MS05MzU1LTdmNDktYWE2OC1hMGViZTU0YjcyNDIiIHhtcE1NOkRvY3VtZW50SUQ9ImFkb2JlOmRvY2lkOnBob3Rvc2hvcDphYmJlY2MwZS1kNjU2LTJhNDYtODllNy05M2Q5MjExNTRjM2IiIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDpmYTg3NDNhYy1kMTEwLTcwNGEtOTc0OS04ODFiMGZlYmE4ZjEiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOmZhODc0M2FjLWQxMTAtNzA0YS05NzQ5LTg4MWIwZmViYThmMSIgc3RFdnQ6d2hlbj0iMjAyMC0wNS0yNFQxNzo1MTo0NiswMjowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDIxLjAgKFdpbmRvd3MpIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjb252ZXJ0ZWQiIHN0RXZ0OnBhcmFtZXRlcnM9ImZyb20gYXBwbGljYXRpb24vdm5kLmFkb2JlLnBob3Rvc2hvcCB0byBpbWFnZS9wbmciLz4gPHJkZjpsaSBzdEV2dDphY3Rpb249InNhdmVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjFhMTBiNzgxLTkzNTUtN2Y0OS1hYTY4LWEwZWJlNTRiNzI0MiIgc3RFdnQ6d2hlbj0iMjAyMC0wNS0yNFQxODoyMDo0NSswMjowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDIxLjAgKFdpbmRvd3MpIiBzdEV2dDpjaGFuZ2VkPSIvIi8+IDwvcmRmOlNlcT4gPC94bXBNTTpIaXN0b3J5PiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PijpxOwAAADiSURBVGje7dqxDcIwEIbRULEDK7EIW7AEs7AWokQgAr1fAcIV+pD+Did+V5wuTpZ1XZd/yBIkSJDvIe/fFtkjO+SCXJENckCGvQQJEmQeRBe8IyfkhmjtGdH/hgIGCRJkHkQdRTd+IivyQLRWhRk6Y5AgQeZBNFKoo2iDxw8jsDreMPIECRJkHkTPFLqJNvMpREVQsYaiBgkSZB5EhwoaHzRmaIMCa63GoGFcChIkyDyIThV/OUBQx1NhtHY4CAkSJMg8iF4r6PRRhxR6ltHIo86oAk5/PxIkSJC+fAgS5G8hLxcikh90CdQ+AAAAAElFTkSuQmCC');
        background-repeat: no-repeat;
        background-size: 60%;
        background-position: bottom 2px left 2.5px;
    }
}

.frame {
    overflow-y: scroll;
}

.title-bar {
    -webkit-app-region: drag;
}

.title-bar-controls {
    -webkit-app-region: no-drag;
}

#app {
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-align: center;
    color: #2c3e50;
}

#nav {
    padding: 30px;

    a {
        font-weight: bold;
        color: #2c3e50;

        &.router-link-exact-active {
            color: #42b983;
        }
    }
}
</style>
