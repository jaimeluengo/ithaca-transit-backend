const { ChronicleSession } = require('appdev');
const keys = require('./Keys.js');

const chronicleTransit = new ChronicleSession(
    keys.accessKey,
    keys.secretKey,
    'IthacaTransit',
);

// requests schema
const requests = {
    token: { type: 'UTF8' },
    start: { type: 'UTF8' },
    end: { type: 'UTF8' },
    time: { type: 'TIMESTAMP_MILLIS' }, // epoch time
    rids: { type: 'UTF8', repeated: true },
};

// shortened computed routes table
/*
const shortRoutes = {
  rid: { type: 'INT64' },
};

// user selection table
const userSelection = {
  uid: { type: 'UTF8' },
  // start, dest names, route times, etc
  rids: { type: 'LIST' },
}

// cache hits/misses for Google places
const cacheMiss = {
  date: Date.now(),
  cacheMiss: true,
};

// errors
const errors = {
  id: { type: 'UTF8' }, // datetime string
}
*/
