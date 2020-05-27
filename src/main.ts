import Vue from 'vue';
import * as os from 'os';
import App from './App.vue';
import '98.css/dist/98.css';
import '../resources/css/tailwind.css';
import vClickOutside from 'v-click-outside';

import {
    LolApi,
    Champions,
    RunePage,
    PartyLobby,
    GameLobby
} from './service/classes';
import { Config } from './config';

const lolApi = new LolApi();
const champions = new Champions(lolApi);
const rune = new RunePage(lolApi);
const lobby = new PartyLobby(lolApi);
const gameLobby = new GameLobby(lolApi);

const config = new Config(`${os.userInfo().homedir}\\blitx.json`);
config.writeConfig();

Vue.use(vClickOutside);
Vue.config.productionTip = false;

new Vue({
    render: h => h(App),
    data() {
        return { config, service: { lolApi, champions, rune, lobby, gameLobby } };
    }
}).$mount('#app');
