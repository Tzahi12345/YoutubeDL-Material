const fs = require('fs-extra');
const path = require('path');

class FileSync {
    constructor(filename) {
        this.filename = filename;
    }

    read() {
        try {
            return fs.readJSONSync(this.filename);
        } catch (error) {
            if (error.code === 'ENOENT') {
                fs.ensureDirSync(path.dirname(this.filename));
                fs.writeJSONSync(this.filename, {});
                return {};
            }

            if (error.name === 'SyntaxError') {
                return {};
            }

            throw error;
        }
    }

    write(data) {
        fs.ensureDirSync(path.dirname(this.filename));
        fs.writeJSONSync(this.filename, data, { spaces: 2 });
        return data;
    }
}

module.exports = FileSync;
