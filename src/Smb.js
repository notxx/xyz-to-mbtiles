const path = require("path");
const EventEmitter = require("events");

const smb2 = require("@awo00/smb2");

const { tileColumnToLongitude, tileRowToLatitude } = require("./utils");

const pattern = {
	z: /^\.\/(\d{1,2})$/,
	x: /^\.\/(\d+)$/,
	y: /^\.\/(\d+)(.*)$/,
};

class Smb extends EventEmitter {
	/**
	 * 
	 * @param {Object} options 
	 * @param {string} options.host 
	 * @param {string} options.domain
	 * @param {string} options.username 
	 * @param {string} options.password 
	 * @param {string} options.tree 
	 * @param {string} options.base 
	 */
	constructor(options) {
		super();
		this.options = options;
	}

	async open() {
		const { host, username, password, tree } = this.options;
		let { requestTimeout, domain } = this.options;
		requestTimeout = requestTimeout || 30 * 1000;
		domain = domain || "";
		const client = this.client = new smb2.Client(host, { requestTimeout });
		const session = await client.authenticate({ domain, username, password });
		this.tree = await session.connectTree(tree);
	}

	async close() {
		const { client } = this;
		if (client && typeof client.close === "function")
			await client.close();
	}

	async prepare() {
		const { base } = this.options;
		const entries = await this.tree.readDirectory(base);
		/** @type {string[]} */
		const zooms = this.zooms = [];
		// console.log(entries);
		for (const entry of entries) {
			if (entry.type === "File") continue;
			const match = pattern.z.exec(entry.filename);
			// console.log(entry.filename, match);
			if (!match) continue;
			// console.log(match[1]);
			const [, zoom ] = match;
			// console.log(zoom);
			// zooms.push(parseInt(zoom));
			zooms.push(zoom);
		}
		zooms.sort();
	}

	get maxZoom() {
		if (!this.zooms) throw new TypeError("prepare() first");
		return this.zooms[ this.zooms.length - 1 ];
	}

	get minZoom() {
		if (!this.zooms) throw new TypeError("prepare() first");
		return this.zooms[ 0 ];
	}

	async calculateBounds(zoom) {
		if (!zoom || this.zooms.indexOf(zoom) < 0) throw new TypeError(`invalid zoom (${zoom})`);
		const { base } = this.options;
		const { tree } = this;
		const bounds = [ 180, 85, -180, -85 ];
		const dir = path.join(base, zoom);
		const entries = await tree.readDirectory(dir);
		for (const entry of entries) {
			if (entry.type === "File") continue;
			// console.log(yEntry.filename);
			const match = pattern.x.exec(entry.filename);
			if (!match) continue;
			// console.log(match[1]);
			const [, x ] = match;
			const column = parseInt(x);
			const dir = path.join(base, zoom, x);
			const entries = await tree.readDirectory(dir);
			for (const entry of entries) {
				// console.log(yEntry.filename);
				const match = pattern.y.exec(entry.filename);
				if (!match) continue;
				let [, y ] = match;
				y = parseInt(y);
				// y = (2 << (zoom - 1)) - 1 - y;
				// console.log(zoom, x, y);
				const lon0 = tileColumnToLongitude(column, zoom);
				if (lon0 < bounds[0])
					bounds[0] = lon0;
				const lat0 = tileRowToLatitude(y, zoom);
				if (lat0 < bounds[1])
					bounds[1] = lat0;
				const lon1 = tileColumnToLongitude(column + 1, zoom);
				if (lon1 > bounds[2])
					bounds[2] = lon1;
				const lat1 = tileRowToLatitude(y + 1, zoom);
				if (lat1 > bounds[3])
					bounds[3] = lat1;
				// console.log(lon0, lat0, lon1, lat1);
				// console.log(...bounds);
			}
		}
		return bounds;
	}

	/**
	 * 
	 * @param {import("./Db").Db} db 
	 */
	async dump(db) {
		const { base } = this.options;
		const { tree, zooms } = this;
		const start = Date.now();
		// console.log(start, zooms);
		for (const z of zooms) {
			const level = parseInt(z);
			this.emit("level-start", { level });
			const dir = path.join(base, z);
			const entries = await tree.readDirectory(dir);
			for (const entry of entries) {
				if (entry.type === "File") continue;
				// console.log(yEntry.filename);
				const match = pattern.x.exec(entry.filename);
				if (!match) continue;
				// console.log(match[1]);
				const [, x ] = match;
				const column = parseInt(x),
					start = Date.now();
				this.emit("column-start", { level, column });
				if (db.reopen && (await db.queryTiles(z, x)) > 0) {
					continue;
				}
				const dir = path.join(base, z, x);
				const entries = await tree.readDirectory(dir);
				const tiles = [];
				for (const entry of entries) {
					// console.log(yEntry.filename);
					const match = pattern.y.exec(entry.filename);
					if (!match) continue;
					const [, y ] = match;
					const row = (2 << (level - 1)) - 1 - y,
						start = Date.now();
					this.emit("row-start", { level, column, row });
					// console.log(zoom, x, y, ext);
					// const file = path.join(base, zoom, x, y + ext);
					const file = path.join(base, z, x, entry.filename);
					// console.log(z, x, y, file);
					try {
						const data = await tree.readFile(file);
						// console.log(file, buf.length);
						tiles.push({
							x, y: row, z,
							data
						});
					} catch (error) {
						console.log("error readFile", file);
					}
					this.emit("row-end", { level, column, row, cost: Date.now() - start });
				}
				db.insertTiles(...tiles);
				this.emit("column-end", { level, column, cost: Date.now() - start });
			}
			this.emit("level-end", { level, cost: Date.now() - start });
			// console.log(z, (Date.now() - start) / 1000);
		}
	}
}

module.exports = {
	Smb
};