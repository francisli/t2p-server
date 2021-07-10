const nock = require('nock');
const path = require('path');

// Uncomment line below to record external HTTP calls
// nock.recorder.rec();

function mockDownloads(filePaths) {
  for (const filePath of filePaths) {
    nock('https://geonames.usgs.gov', { encodedQueryParams: true })
      .get(`/docs/federalcodes/${filePath}`)
      .replyWithFile(200, path.resolve(__dirname, 'geonames', filePath));
  }
}

function mockCaliforniaDownloads() {
  mockDownloads(['CA_FedCodes.zip', 'AZ_FedCodes.zip', 'NV_FedCodes.zip', 'OR_FedCodes.zip']);
}

function mockWashingtonDownloads() {
  mockDownloads(['WA_FedCodes.zip', 'OR_FedCodes.zip', 'ID_FedCodes.zip']);
}

module.exports = {
  mockCaliforniaDownloads,
  mockWashingtonDownloads,
};
