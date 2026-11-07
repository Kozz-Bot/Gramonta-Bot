let active = 0;
process.on('disconnect', () => process.exit(0));
process.on('message', message => {
	const action = message.bytes.toString();
	if (action === 'crash') return process.exit(1);
	if (action === 'hang') return;
	active++;
	setTimeout(() => {
		const parallel = active;
		active--;
		process.send({
			id: message.id,
			output: Buffer.from(JSON.stringify({ action, parallel, pid: process.pid })),
		});
	}, 10);
});
