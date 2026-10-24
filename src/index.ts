import dotenv from 'dotenv';
dotenv.config({
	path: '.env',
});

import * as handleStarters from './Handlers/';
import * as proxyStarters from './Proxies';
import { useGroupCommands } from './Middlewares/GroupCommands';
import { useMute } from './Proxies/Mute/middleware/useMute';
import { startReactionPayloadListener } from './Services/ReactionPayloadListener';
import { startBaguncinhaCountdown } from './Services/BaguncinhaCountdown';
import { startPeriodicStatus } from './Services/PeriodicStatus';

let delay = 0;
let delayIncrement = 1000; // 0,35s

// Not trying to connect every single module at the same time seems to
// work the best
Object.values({ ...handleStarters, ...proxyStarters }).forEach(starter => {
	setTimeout(() => {
		const module = starter();

		if (module) {
			module.use(useGroupCommands);
			module.use(useMute);
		}
	}, delay);
	delay += delayIncrement;
});
startReactionPayloadListener();
startBaguncinhaCountdown();
startPeriodicStatus();
