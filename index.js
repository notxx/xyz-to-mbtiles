#!/usr/bin/env node
const program = require('commander')

const cmd = program
	.option('--host [host]', 'Samba host')
	.option('--domain [domain]', 'Samba domain', "")
	.option('--username [username]', 'Samba username')
	.option('--password [password]', 'Samba password')
	.option('--share [share]', 'Samba share folder')
	.option('--base [base]', 'Samba base')
	.option('--output [output.mbtiles]', 'Output file', "output.mbtiles")
	// .option('--minzoom [minzoom]', 'Min zoom level')
	// .option('--maxzoom [maxzoom]', 'Max zoom level')
	.parse(process.argv);


if (typeof cmd.host !== "string") {
	throw 'Missing samba host!'
}

if (typeof cmd.username !== "string") {
	throw 'Missing samba username!'
}

if (typeof cmd.password !== "string") {
	throw 'Missing samba password!'
}

if (typeof cmd.share !== "string") {
	throw 'Missing samba share!'
}

if (typeof cmd.base !== "string") {
	throw 'Missing samba base!'
}

if (typeof cmd.output !== "string") {
	throw 'Missing output file!'
}

const { Db } = require("./src/Db");
const { Smb } = require("./src/Smb");

const { host, domain, username, password, share, base } = cmd;

// console.log(host, domain, username, password, share, base);

(async function() {
	let smb = new Smb({ host, domain, username, password, tree: share, base });
	try {
		await smb.open();
		await smb.prepare();
		const bounds = await smb.calculateBounds(smb.maxZoom);

		const db = new Db(cmd.output, {
			description: "",
			// bbox: [ 117.82807504499779, 34.06825154643152, 117.91594434065291, 34.12139974632775 ], // TODO
			bounds,
			maxzoom: smb.maxZoom,
			minzoom: smb.minZoom,
			format: "png"
		});

		smb.on("level-start", (...args) => console.log(...args));
		smb.on("level-end", (...args) => console.log(...args));
		// smb.on("column-start", (...args) => console.log(...args));
		smb.on("column-end", (...args) => console.log(...args));
		// smb.on("row-start", (...args) => console.log(...args));
		// smb.on("row-end", (...args) => console.log(...args));

		await smb.dump(db);
	} catch (error) {
		console.log(error);
	} finally {
		if (smb) await smb.close();
	}
})();
