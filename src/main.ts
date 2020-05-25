import Vue from 'vue';
import App from './App.vue';
// import router from './router';
// import store from './store';
import '98.css/dist/98.css';
import { Config } from './config';

const config = new Config();
config.writeConfig()

Vue.config.productionTip = false;

new Vue({
  // router,
  // store,
  render: h => h(App),
  data() {
    return { config };
  }
}).$mount('#app');
