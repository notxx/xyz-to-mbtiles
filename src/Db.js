const fs = require("fs");
const sqlite3 = require('sqlite3');

/**
 */
class Db extends sqlite3.Database {
	/**
	 * 
	 * @param {string} filename 
	 * @returns {boolean}
	 */
	static exists(filename) {
		return fs.existsSync(filename);
	}

	/**
	 * 
	 * @param {string} filename 
	 * @param {Object} [options] 
	 * @param {string} options.description 
	 * @param {[ number, number, number, number ]} options.bounds 
	 * @param {number} options.maxzoom 
	 * @param {number} options.minzoom 
	 * @param {"png" | "jpg"} options.format 
	 */
	constructor(filename, options) {
		const exists = fs.existsSync(filename);
		super(filename);
		/** @type {boolean} reopen db file */
		this.reopen = exists;
		this.options = options;
		if (!exists) {
			this.initTables();
			this.createMetadata()
		}
	}

	/**
	 * 
	 */
	initTables() {
		this.serialize(() => {
			this.run('CREATE TABLE IF NOT EXISTS metadata (name text, value text);');
			this.run('CREATE UNIQUE INDEX IF NOT EXISTS name ON metadata (name);');

			this.run('CREATE TABLE IF NOT EXISTS tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob);');
			this.run('CREATE UNIQUE INDEX IF NOT EXISTS tile_index on tiles (zoom_level, tile_column, tile_row);');
			this.run('PRAGMA synchronous=OFF');
		});
	}

	/**
	 * 
	 * @param {Object} param 
	 * @param {string} param.description 
	 */
	createMetadata() {
		console.log('Insert metadata ...')
		const { description, bounds, maxzoom, minzoom, format } = this.options;
		this.run('INSERT INTO metadata VALUES(?,?)', ['bounds', bounds.join(',')])
		this.run('INSERT INTO metadata VALUES(?,?)', ['maxzoom', maxzoom])
		this.run('INSERT INTO metadata VALUES(?,?)', ['minzoom', minzoom])
		this.run('INSERT INTO metadata VALUES(?,?)', ['name', `xyz-to-mbtiles`])
		this.run('INSERT INTO metadata VALUES(?,?)', ['type', 'overlay'])
		this.run('INSERT INTO metadata VALUES(?,?)', ['version', '1'])
		this.run('INSERT INTO metadata VALUES(?,?)', ['description', description])
		this.run('INSERT INTO metadata VALUES(?,?)', ['format', format])
	}

	/**
	 * 
	 * @param {string | number} z zoom level
	 * @param {string | number} x tile column
	 * @returns {number} count
	 */
	async queryTiles(z, x) {
		return new Promise((resolve, reject) => {
			this.serialize(() => {
				const statement = this.prepare("SELECT count(1) AS count FROM tiles WHERE zoom_level = ? AND tile_column = ?")
				statement.get(z, x, (error, row) => {
					if (error)
						reject(error);
					else
						resolve(row["count"]);
				}).finalize();
			});
		});
	}
	
	/**
	 * 
	 * @param {Object[]} tiles Map Tile
	 * @param {string | number} tiles.x Tile Column 
	 * @param {string | number} tiles.y Tile Row
	 * @param {string | number} tiles.z Zoom Level
	 * @param {Buffer} tiles.data Tile Image Data
	 * @returns {void}
	 */
	async insertTiles(...tiles) {
		return new Promise((resolve, reject) => {
			this.serialize(() => {
				const preparedStatement = this.prepare("INSERT INTO tiles VALUES (?,?,?,?)");
				for (const t of tiles) {
					if (t) {
						preparedStatement.run(t.z, t.x, t.y, t.data)
					}
				}
				preparedStatement.finalize(resolve);
			});
		});
	}
}

module.exports = {
	Db
};