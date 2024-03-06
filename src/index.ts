import dotenv from 'dotenv';
dotenv.config();

import * as handleStarters from './Handlers/';
import * as proxyStarters from './Proxies';

let delay = 0;
let delayIncrement = 350; // 0,35s

// Not trying to connect every single module at the same time seems to
// work the best
Object.values({ ...handleStarters, ...proxyStarters }).forEach(starter => {
	setTimeout(starter, delay);
	delay += delayIncrement;
});



