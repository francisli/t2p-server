'use strict'

const models = require('../../models');
const Op = models.Sequelize.Op;
const _ = require('lodash');


const cache = {
  nameMapping: {},
  codeMapping: {},
};

const findByNameAndClass = function(cities, name, featureClass) {
  return _.find(cities, c => c.featureClass === featureClass && name.localeCompare(c.featureName, undefined, { sensitivity: 'accent' }) === 0);
}

const getCode = async function(name, stateNumeric) {
  if (cache.nameMapping[name]) {
    return cache.nameMapping[name];
  }
  const cities = await models.City.findAll({
    where: {
      featureName: {
        [Op.iLike]: `%${name}%`
      },
      stateNumeric
    }
  });
  /// check for an exact match of name in Civil
  let match = findByNameAndClass(cities, name, 'Civil');
  if (match) {
    cache.nameMapping[name] = match.featureId;
    return match.featureId;
  }
  /// check for a match to City of name in Civil
  match = findByNameAndClass(cities, `City of ${name}`, 'Civil');
  if (match) {
    cache.nameMapping[name] = match.featureId;
    return match.featureId;
  }
  /// check for an exact match in Populated Place
  match = findByNameAndClass(cities, name, 'Populated Place');
  if (match) {
    cache.nameMapping[name] = match.featureId;
    return match.featureId;
  }
  /// check for an exact match in Military
  match = findByNameAndClass(cities, name, 'Military');
  if (match) {
    cache.nameMapping[name] = match.featureId;
    return match.featureId;
  }
  /// check for an exact match in Census Designated Places
  match = findByNameAndClass(cities, name, 'Census');
  if (match) {
    cache.nameMapping[name] = match.featureId;
    return match.featureId;
  }
  /// check for an exact match in Census Designated Places
  match = findByNameAndClass(cities, `${name} Census Designated Place`, 'Census');
  if (match) {
    cache.nameMapping[name] = match.featureId;
    return match.featureId;
  }
  cache.nameMapping[name] = null;
  return null;
};

const getName = async function(code) {
  if (cache.codeMapping[code]) {
    return cache.codeMapping[code];
  }
  const city = await models.City.findOne({where: {featureId: code}});
  if (city) {
    cache.codeMapping[code] = city.featureName;
    return city.featureName;
  }
  cache.codeMapping[code] = null;
  return null;
};

module.exports = {
  getCode,
  getName,
}
