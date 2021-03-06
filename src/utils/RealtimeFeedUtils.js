// @flow
import interval from 'interval-promise';
import xml2js from 'xml2js';
import JsonFind from 'json-find';
import jsonQuery from 'json-query';
import fs from 'fs';
import RequestUtils from './RequestUtils';
import ErrorUtils from './LogUtils';
import TokenUtils from './TokenUtils';

/**
 * Given a stopID and tripID,
 * we want to find the delay for that stop and vehicleID of the bus on the trip:
 * { vehicleID, delay, and tripID }
 *
 * With the vehicleID we can find the vehicle's location for live tracking.
 *
 * How we parse the realtime data:
 * We get an XML with <Entities> with an array of <FeedEntity>
 * Each XML response has the following tags (with example data):
 *
 <FeedMessage>
     <Entities>
         <FeedEntity>
             <Id>t41C-sl13-p330-r9F</Id> (containing a tripId)
             <IsDeleted>false</IsDeleted>
             <TripUpdate>
                 <Trip>
                     <TripId>t41C-sl13-p330-r9F</TripId> (containing a tripId)
                     <RouteId>32</RouteId>
                     <DirectionId>0</DirectionId>
                     <StartDate>20181007</StartDate>
                     <schedule_relationship xmlns="Trip">Scheduled</schedule_relationship>
                 </Trip>
                 <Vehicle>
                     <Id>1802</Id>
                     <Label>1802</Label>
                 </Vehicle>
                 <StopTimeUpdates>
                     <StopTimeUpdate>
                         <StopSequence>0</StopSequence>
                         <StopId>60</StopId>
                         <Arrival>
                             <Delay>130</Delay>
                             <Time>1538971270</Time>
                             <Uncertainty>0</Uncertainty>
                         </Arrival>
                         <Departure>
                             <Delay>70</Delay>
                             <Time>1538971270</Time>
                             <Uncertainty>0</Uncertainty>
                         </Departure>
                         <schedule_relationship>Scheduled</schedule_relationship>
                    <StopTimeUpdate>
                 ...
                 </StopTimeUpdates>
                 <Timestamp>1538969911</Timestamp>
                 <Delay>0</Delay>
                 <RouteId>routeid</RouteId>
                 <DirectionId>boolean</DirectionId>
             </TripUpdate>
         </FeedEntity>
     ...
     </Entities>
 </FeedMessage>
 *
 * We want to generate an object with tripids as keys for easy finding
 * For each FeedEntity we get the tripID, vehicleID, vehicle label,
 * delay, and stopUpdates containing delay per stop:
 *
 {
    't41C-sl13-p330-r9F': { // indexed by tripId (if not IsDeleted)
        routeId: '32',
        vehicleId: '1802',
        delay: 0,
        stopUpdates: { // stopUpdates will be an object of stopId -> delay, but
                       // only when the stops have different delays.
                       // Otherwise, it will be the delay value of all stops in the tripId
                       // or null if none.
            '155': { // indexed by stopId, use only first instance if duplicates
                delay: 130 //departure delay per stop
            }
            ...
        }
    }
    ...
 }
 *
 * Then, we save this as the realtimeFeed object and reference it
 * in order to get delay and tracking info.
 */

let realtimeFeed = fetchRealtimeFeed();

function xmlToJSON(xml: String) {
    const normalize = name => name.toLowerCase();
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml,
            {
                tagNameProcessors: [normalize],
                attrNameProcessors: [normalize],
                trim: true,
            }, (err, result) => {
                if (err) {
                    throw ErrorUtils.logErr(err, null, 'Parse XML string error');
                }

                if (!result
                    || !result.feedmessage
                    || !result.feedmessage.entities
                    || !result.feedmessage.entities.length > 0
                    || !result.feedmessage.entities[0].feedentity) {
                    // ErrorUtils.logErr('null or undefined feed result', result, 'Feed result invalid');
                    resolve(null);
                    return null;
                }

                const realtimeNew = {};

                const helpers = {
                    unpack: input => (input && input.length > 0 && input[0]) || input,
                    isTripId: input => (/\w*(-)\w*(-)\w*(-)\w*/g.test(input) && input) || null,
                    toInt: input => parseInt(input),
                };

                // tripRealtimeFeed =
                result.feedmessage.entities[0].feedentity.map((entity) => {
                    const search = JsonFind(entity);
                    const trip = search.findValues(
                        'id',
                        'tripid',
                        'delay',
                        'vehicle',
                        'routeid',
                        'stoptimeupdate',
                    );

                    const realtimeTrip = {};

                    const tripId = jsonQuery('id:unpack:isTripId', {
                        data: trip,
                        allowRegexp: true,
                        locals: helpers,
                    }).value
                        || jsonQuery('tripId:unpack:isTripId', {
                            data: trip,
                            allowRegexp: true,
                            locals: helpers,
                        }).value;

                    realtimeTrip.delay = jsonQuery('delay:unpack', {
                        data: trip,
                        allowRegexp: true,
                        locals: helpers,
                    }).value;

                    realtimeTrip.routeId = jsonQuery('routeid:unpack', {
                        data: trip,
                        allowRegexp: true,
                        locals: helpers,
                    }).value;

                    realtimeTrip.vehicleId = jsonQuery('vehicle:unpack.id:unpack', {
                        data: trip,
                        allowRegexp: true,
                        locals: helpers,
                    }).value;

                    const stopUpdates = jsonQuery('stoptimeupdate', {
                        data: trip,
                        allowRegexp: true,
                        locals: helpers,
                    }).value;

                    const stopDelays = {};

                    // if all delays are the same, set delay to that delay instead of per-stop
                    let delayAll = null;
                    (stopUpdates || []).map((stopUpdate) => {
                        const stopId = jsonQuery('stopid:unpack', {
                            data: stopUpdate,
                            allowRegexp: true,
                            locals: helpers,
                        }).value;

                        const delay = jsonQuery('departure:unpack.delay:unpack', {
                            data: stopUpdate,
                            allowRegexp: true,
                            locals: helpers,
                        }).value;

                        if (stopDelays && !stopDelays[stopId]) {
                            if (delayAll === null) {
                                delayAll = delay;
                            } else if (delayAll !== delay) {
                                delayAll = false;
                            }
                            stopDelays[stopId] = delay;
                        }
                        return true;
                    });
                    if (!Number.isNaN(parseInt(delayAll))) {
                        realtimeTrip.delayAll = delayAll;
                    } else {
                        realtimeTrip.stopUpdates = stopDelays;
                    }
                    if (realtimeNew && !realtimeNew[tripId]) {
                        realtimeNew[tripId] = realtimeTrip;
                    }

                    return true;
                });

                resolve(realtimeNew);
                return realtimeNew;
            });
    }).catch((err) => {
        throw ErrorUtils.logErr(err, xml, 'Could not parse trip feed JSON');
    });
}

/**
 * Given an array of { stopID, routeID, [tripID] },
 * Return bus and tracking data including location
 * Input:
 [
 {
   “stopID” : String,
   “routeID” : String,
   “tripIdentifiers” : [String]
 },
 …
 ]
 */
async function getTrackingResponse(trackingRequests: Object) {
    const trackingInformation = [];
    let noData = false;
    const rtf = (await realtimeFeed); // ensures the realtimeFeed doesn't update in the middle of execution

    // for each input
    await Promise.all(trackingRequests.map(async (data): Promise<number> => {
        const { stopID, routeID, tripIdentifiers } = data;

        const realtimeDelayData = getTrackingInformation(stopID, tripIdentifiers[0], rtf);

        if (realtimeDelayData) {
            const authHeader = await TokenUtils.fetchAuthHeader();

            const options = {
                method: 'GET',
                url: 'https://gateway.api.cloud.wso2.com:443/t/mystop/tcat/v1/rest/Vehicles/GetAllVehiclesForRoute',
                headers:
                    {
                        'Postman-Token': 'b688b636-87ea-4e04-9f3e-ba34e811e639',
                        'Cache-Control': 'no-cache',
                        Authorization: authHeader,
                    },
                qs:
                    {
                        routeID,
                    },
            };

            const trackingRequest = await RequestUtils.createRequest(options, 'Tracking request failed');

            if (!trackingRequest) return false;

            /**
             * Parse request to object and map valid realtime data to info for each bus
             */
            const busFound = JSON.parse(trackingRequest) // parse the request
                .find( // find the first tracking data matching the vehicleId
                    busInfo => busInfo.VehicleId === realtimeDelayData.vehicleId,
                );

            if (!busFound) return false;

            const trackingData = ((busInfo) => { // create object and return
                let lastUpdated = busInfo.LastUpdated;
                const firstParan = lastUpdated.indexOf('(') + 1;
                const secondParan = lastUpdated.indexOf('-');
                lastUpdated = parseInt(lastUpdated.slice(firstParan, secondParan));
                return {
                    case: 'validData',
                    commStatus: busInfo.CommStatus,
                    delay: realtimeDelayData.delay,
                    destination: busInfo.Destination,
                    deviation: busInfo.Deviation,
                    direction: busInfo.Direction,
                    displayStatus: busInfo.DisplayStatus,
                    gpsStatus: busInfo.GPSStatus,
                    heading: busInfo.Heading,
                    lastStop: busInfo.LastStop,
                    lastUpdated,
                    latitude: busInfo.Latitude,
                    longitude: busInfo.Longitude,
                    name: busInfo.Name,
                    opStatus: busInfo.OpStatus,
                    routeID: busInfo.RouteId,
                    runID: busInfo.RunId,
                    speed: busInfo.Speed,
                    tripID: busInfo.TripId,
                    vehicleID: busInfo.VehicleId,
                };
            })(busFound);

            // we have tracking data for the bus
            if (trackingData) {
                trackingInformation.push(trackingData);
            } else {
                noData = true;
                return false;
            }
            return true;
        }

        return false;
    })).catch((err) => {
        ErrorUtils.logErr(err, trackingRequests, 'Tracking error');
        throw err;
    });

    if (await trackingInformation && trackingInformation.length > 0) {
        return trackingInformation;
    } if (noData) {
        return {
            case: 'noData',
        };
    }
    return {
        case: 'invalidData',
    };
}

/**
 * Returns a { vehicleID, delay } object
 * @param stopID
 * @param tripID
 * @param rtf
 * @returns {Promise<*>}
 */
function getTrackingInformation(stopID: String, tripID: String, rtf: Object) {
    // rtf param ensures the realtimeFeed doesn't update in the middle of execution

    // if invalid params or the trip is inactive
    if (!stopID
        || !tripID
        || !(rtf)
        || !(rtf[tripID])) {
        return null;
    }

    const info = rtf[tripID];

    let delay = parseInt(info.stopUpdates && info.stopUpdates[stopID]);
    if (Number.isNaN(delay)) delay = parseInt(info.delayAll);

    return {
        vehicleId: parseInt(info.vehicleId),
        delay,
    };
}

async function fetchRealtimeFeed() {
    const options = {
        method: 'GET',
        url: 'https://realtimetcatbus.availtec.com/InfoPoint/GTFS-Realtime.ashx?&Type=TripUpdate&debug=true',
        headers:
            {
                'Cache-Control': 'no-cache',
            },
    };
    const xml = await RequestUtils.createRequest(options, 'Trip realtime request failed');
    if (xml) {
        const obj = await xmlToJSON(xml);

        if (obj === null || !obj) {
            // no current delay/tracking data
            if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
                const xmlPlaceholder = fs.readFileSync('src/test/test_data/GTFS-Realtime-test.xml');
                // eslint-disable-next-line no-console
                console.warn('WARNING: USING TEST REALTIME DATA, NO RESPONSE DATA RECIEVED');
                return xmlToJSON(xmlPlaceholder);
            }
            return {};
        }
        return obj;
    }

    return null;
}

/**
 * Update realtime data every few seconds
 */
function start() {
    interval(async () => {
        // fetch and set realtime feed
        await realtimeFeed; // if initializing, don't try again
        realtimeFeed = await fetchRealtimeFeed();
    }, 3000, { stopOnError: false });
}

export default {
    start,
    getTrackingInformation,
    realtimeFeed,
    getTrackingResponse,
};
