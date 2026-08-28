import './assets/main.css';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

const app = createApp(App);

app.use(createPinia());

app.mount('#app');
