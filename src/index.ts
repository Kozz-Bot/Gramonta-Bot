import dotenv from 'dotenv';
dotenv.config();

import * as handleStarters from './Handlers/';
import * as proxyStarters from './Proxies';
import { useMute } from './Proxies/Mute';

let delay = 0;
let delayIncrement = 1000; // 0,35s

// Not trying to connect every single module at the same time seems to
// work the best
Object.values({ ...handleStarters, ...proxyStarters }).forEach(starter => {
	setTimeout(() => {
		const module = starter();

		if (module) {
			module.use(useMute);
		}
	}, delay);
	delay += delayIncrement;
});
