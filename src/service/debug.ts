import * as os from 'os';
import { Champions, GameLobby, PartyLobby, RunePage, Summoners, LolApi } from './classes';
import { Config } from '../config';
import * as service from './main';

const lolApi = new LolApi();
const champions = new Champions(lolApi);
const rune = new RunePage(lolApi);
const lobby = new PartyLobby(lolApi);
const gameLobby = new GameLobby(lolApi);
const summoners = new Summoners(lolApi);

const config = new Config(`${os.userInfo().homedir}\\blitx.json`);


service.run(config, {
    champions,
    rune,
    lobby,
    gameLobby,
    summoners
})

