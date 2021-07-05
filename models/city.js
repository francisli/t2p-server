const { Model, Op } = require('sequelize');
const _ = require('lodash');

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
      const cities = await City.findAll(
        {
          where: {
            featureName: {
              [Op.iLike]: `%${name}%`,
            },
            stateNumeric,
          },
        },
        options
      );
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
      const city = await City.findByPk(code, options);
      if (city) {
        cache.codeMapping[code] = city.featureName;
        return city.featureName;
      }
      cache.codeMapping[code] = null;
      return null;
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
