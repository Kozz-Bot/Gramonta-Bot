const { installModel } = require('../dist/Services/BackgroundRemoval/model');
installModel()
	.then(() => console.log('Modelo u2netp instalado e checksum SHA-256 verificado.'))
	.catch(() => {
		console.error(
			'Não foi possível instalar/verificar o modelo u2netp. Confira a conexão e execute novamente.'
		);
		process.exitCode = 1;
	});
