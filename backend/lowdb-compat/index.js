const _ = require('lodash');

function isObjectLike(value) {
    return value !== null && typeof value === 'object';
}

class Chain {
    constructor(db, getter, setter) {
        this._db = db;
        this._getter = getter;
        this._setter = setter;
    }

    _value() {
        return this._getter();
    }

    _set(nextValue) {
        this._setter(nextValue);
        return nextValue;
    }

    value() {
        return this._value();
    }

    write() {
        return this._db.write();
    }

    get(path) {
        return new Chain(
            this._db,
            () => _.get(this._value(), path),
            (nextValue) => {
                let currentValue = this._value();
                if (!isObjectLike(currentValue)) {
                    currentValue = {};
                    this._set(currentValue);
                }
                _.set(currentValue, path, nextValue);
            }
        );
    }

    set(path, value) {
        let currentValue = this._value();
        if (!isObjectLike(currentValue)) {
            currentValue = {};
            this._set(currentValue);
        }
        _.set(currentValue, path, value);
        return this;
    }

    defaults(defaultValue) {
        let currentValue = this._value();
        if (!isObjectLike(currentValue)) {
            currentValue = {};
            this._set(currentValue);
        }
        _.defaultsDeep(currentValue, _.cloneDeep(defaultValue));
        return this;
    }

    assign(value) {
        let currentValue = this._value();
        if (!isObjectLike(currentValue)) {
            currentValue = {};
            this._set(currentValue);
        }
        Object.assign(currentValue, value);
        return this;
    }

    merge(value) {
        let currentValue = this._value();
        if (!isObjectLike(currentValue)) {
            currentValue = {};
            this._set(currentValue);
        }
        _.merge(currentValue, value);
        return this;
    }

    unset(paths) {
        const currentValue = this._value();
        if (!isObjectLike(currentValue)) return this;

        if (Array.isArray(paths)) {
            paths.forEach(path => _.unset(currentValue, path));
        } else {
            _.unset(currentValue, paths);
        }
        return this;
    }

    push(...values) {
        let currentValue = this._value();
        if (!Array.isArray(currentValue)) {
            currentValue = [];
            this._set(currentValue);
        }
        currentValue.push(...values);
        return this;
    }

    pull(...values) {
        const currentValue = this._value();
        if (!Array.isArray(currentValue)) return this;

        values.forEach(value => _.pull(currentValue, value));
        return this;
    }

    each(iterator) {
        _.forEach(this._value(), iterator);
        return this;
    }

    find(predicate) {
        const currentValue = this._value();
        let foundRecord = _.find(currentValue, predicate);

        return new Chain(
            this._db,
            () => foundRecord,
            (nextValue) => {
                if (foundRecord === nextValue) return;
                if (Array.isArray(currentValue)) {
                    const index = currentValue.indexOf(foundRecord);
                    if (index !== -1) currentValue[index] = nextValue;
                } else if (isObjectLike(currentValue)) {
                    const key = Object.keys(currentValue).find((objKey) => currentValue[objKey] === foundRecord);
                    if (key !== undefined) currentValue[key] = nextValue;
                }
                foundRecord = nextValue;
            }
        );
    }

    filter(predicate) {
        const filtered = _.filter(this._value(), predicate);
        return new Chain(this._db, () => filtered, () => {});
    }

    remove(predicate) {
        const currentValue = this._value();
        if (Array.isArray(currentValue)) {
            _.remove(currentValue, predicate);
            return this;
        }

        if (isObjectLike(currentValue)) {
            Object.keys(currentValue).forEach((key) => {
                if (predicate(currentValue[key], key, currentValue)) {
                    delete currentValue[key];
                }
            });
        }
        return this;
    }
}

class LowdbCompat extends Chain {
    constructor(adapter) {
        let dbData = adapter.read();
        if (!isObjectLike(dbData)) dbData = {};

        super(
            null,
            () => dbData,
            (nextValue) => {
                dbData = nextValue;
            }
        );

        this._db = this;
        this._adapter = adapter;
        this._readData = () => dbData;
        this._writeData = (nextValue) => {
            dbData = nextValue;
        };
    }

    read() {
        let dbData = this._adapter.read();
        if (!isObjectLike(dbData)) dbData = {};
        this._writeData(dbData);
        return this._readData();
    }

    write() {
        const dbData = this._readData();
        this._adapter.write(dbData);
        return dbData;
    }
}

function low(adapter) {
    return new LowdbCompat(adapter);
}

module.exports = low;
