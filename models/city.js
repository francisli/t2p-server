const { Model, Op } = require('sequelize');
const LineReader = require('line-by-line');
const _ = require('lodash');
const path = require('path');
const tmp = require('tmp');

const { download, unzip } = require('../lib/utils');

const cache = {
  nameMapping: {},
  codeMapping: {},
};

function findByNameAndClass(cities, name, featureClass) {
  return _.find(
    cities,
    (c) =>
      c.featureClass === featureClass &&
      name.localeCompare(c.featureName, undefined, {
        sensitivity: 'accent',
      }) === 0
  );
}

module.exports = (sequelize, DataTypes) => {
  class City extends Model {
    static associate(models) {
      // associations can be defined here
      City.hasMany(models.Facility);
      City.hasMany(models.Scene);
      City.hasMany(models.SceneObservation);
    }

    static async getCode(name, stateNumeric, options) {
      if (cache.nameMapping[name] !== undefined) {
        return cache.nameMapping[name];
      }
      const cities = await City.findAll({
        where: {
          featureName: {
            [Op.iLike]: `%${name}%`,
          },
          stateNumeric,
        },
        transaction: options?.transaction,
      });
      const searchOrder = [
        [name, 'Civil'],
        [`City of ${name}`, 'Civil'],
        [name, 'Populated Place'],
        [name, 'Military'],
        [name, 'Census'],
        [`${name} Census Designated Place`, 'Census'],
      ];
      for (const [searchName, searchClass] of searchOrder) {
        const match = findByNameAndClass(cities, searchName, searchClass);
        if (match) {
          cache.nameMapping[name] = match.id;
          return match.id;
        }
      }
      cache.nameMapping[name] = null;
      return null;
    }

    static async getName(code, options) {
      if (!code) {
        return null;
      }
      if (cache.codeMapping[code] !== undefined) {
        return cache.codeMapping[code];
      }
      const city = await City.findByPk(code, { transaction: options?.transaction });
      if (city) {
        cache.codeMapping[code] = city.featureName;
        return city.featureName;
      }
      cache.codeMapping[code] = null;
      return null;
    }

    static async importCitiesForState(stateId) {
      const tmpDir = tmp.dirSync();
      try {
        const stateAbbr = sequelize.models.State.getAbbrForCode(stateId);
        const cityPath = path.resolve(tmpDir.name, `${stateAbbr}.zip`);
        await download(`https://geonames.usgs.gov/docs/federalcodes/${stateAbbr}_FedCodes.zip`, cityPath);
        const unzippedPath = await unzip(cityPath, tmpDir);
        await City.parseCities(unzippedPath);
      } finally {
        tmpDir.removeCallback();
      }
    }

    static parseCities(filePath) {
      return new Promise((resolve, reject) => {
        let isFirst = true;
        const reader = new LineReader(filePath);
        reader.on('error', (err) => reject(err));
        reader.on('end', () => resolve());
        reader.on('line', (line) => {
          /// skip first header row
          if (isFirst) {
            isFirst = false;
            return;
          }
          const parts = line.split('|');
          if (parts.length > 1) {
            const [
              id,
              featureName,
              featureClass,
              censusCode,
              censusClassCode,
              gsaCode,
              opmCode,
              stateNumeric,
              stateAlpha,
              countySequence,
              countyNumeric,
              countyName,
              primaryLatitude,
              primaryLongitude,
              dateCreated,
              dateEdited,
            ] = parts;
            if (!['Civil', 'Populated Place', 'Military', 'Census'].includes(featureClass)) {
              return;
            }
            reader.pause();
            sequelize.models.City.findOrBuild({ where: { id } })
              .then(([city]) => {
                city.featureName = featureName;
                city.featureClass = featureClass;
                city.censusCode = censusCode;
                city.censusClassCode = censusClassCode;
                city.gsaCode = gsaCode;
                city.opmCode = opmCode;
                city.stateNumeric = stateNumeric;
                city.stateAlpha = stateAlpha;
                city.countySequence = countySequence;
                city.countyNumeric = countyNumeric;
                city.countyName = countyName;
                city.primaryLatitude = primaryLatitude;
                city.primaryLongitude = primaryLongitude;
                city.dateCreated = dateCreated;
                city.dateEdited = dateEdited;
                return city.save();
              })
              .then(() => {
                reader.resume();
              });
          }
        });
      });
    }
  }

  City.init(
    {
      featureName: {
        type: DataTypes.STRING,
        field: 'feature_name',
      },
      featureClass: {
        type: DataTypes.STRING,
        field: 'feature_class',
      },
      censusCode: {
        type: DataTypes.STRING,
        field: 'census_code',
      },
      censusClassCode: {
        type: DataTypes.STRING,
        field: 'census_class_code',
      },
      gsaCode: {
        type: DataTypes.STRING,
        field: 'gsa_code',
      },
      opmCode: {
        type: DataTypes.STRING,
        field: 'opm_code',
      },
      stateNumeric: {
        type: DataTypes.STRING,
        field: 'state_numeric',
      },
      stateAlpha: {
        type: DataTypes.STRING,
        field: 'state_alpha',
      },
      countySequence: {
        type: DataTypes.STRING,
        field: 'county_sequence',
      },
      countyNumeric: {
        type: DataTypes.STRING,
        field: 'county_numeric',
      },
      countyName: {
        type: DataTypes.STRING,
        field: 'county_name',
      },
      primaryLatitude: {
        type: DataTypes.STRING,
        field: 'primary_latitude',
      },
      primaryLongitude: {
        type: DataTypes.STRING,
        field: 'primary_longitude',
      },
      dateCreated: {
        type: DataTypes.STRING,
        field: 'date_created',
      },
      dateEdited: {
        type: DataTypes.STRING,
        field: 'date_edited',
      },
    },
    {
      sequelize,
      modelName: 'City',
      tableName: 'cities',
      underscored: true,
    }
  );

  return City;
};
