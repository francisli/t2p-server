/* eslint-disable import/no-dynamic-require, global-require */
const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');

const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require(`${__dirname}/../config/config.js`)[env];
const db = {};

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

function importModelsFromDir(dirname) {
  fs.readdirSync(dirname)
    .filter((file) => {
      return file.indexOf('.') !== 0 && file !== basename && file !== 'base.js' && file.slice(-3) === '.js';
    })
    .forEach((file) => {
      const model = require(path.join(dirname, file))(sequelize, Sequelize.DataTypes);
      db[model.name] = model;
    });
}

/// import models from current dir
importModelsFromDir(__dirname);
/// import models from any immediate subdirs
fs.readdirSync(__dirname)
  .filter((dir) => {
    return dir.indexOf('.') !== 0 && dir.slice(-3) !== '.js' && dir.slice(-4) !== '.txt';
  })
  .forEach((dir) => {
    importModelsFromDir(path.join(__dirname, dir));
  });

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
